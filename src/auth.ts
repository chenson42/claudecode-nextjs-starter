import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import {
  users,
  accounts,
  sessions,
  verificationTokens,
  userRoles,
  roles,
  roleFeatures,
  features,
} from "@/lib/db/schema";
import { authConfig } from "@/lib/auth/config";
import { ADMIN_ROLE, FEATURES, MEMBER_ROLE } from "@/lib/permissions";
import { getRequestIp, checkRateLimit } from "@/lib/rate-limit";

const INITIAL_ADMIN_EMAILS = (process.env.INITIAL_ADMIN_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const FEATURE_KEYS = Object.values(FEATURES) as string[];

/**
 * Bind a freshly-signed-in user to a default role if they have none.
 *
 * Two reasons we do this here rather than relying on `events.createUser`:
 *
 *   1. `events.createUser` is fire-and-forget — the JWT callback can run
 *      before its async role insert completes, leaving the user with an
 *      empty `roles` array on first request.
 *   2. Credentials users skip the adapter entirely, so `events.createUser`
 *      never fires for them at all (this is why the seed script binds the
 *      local admin's role directly).
 *
 * Idempotent: returns early if the user already holds at least one role.
 */
async function ensureDefaultRole(
  userId: string,
  email: string | null,
): Promise<void> {
  const existing = await db.query.userRoles.findFirst({
    where: eq(userRoles.userId, userId),
  });
  if (existing) return;
  const desiredRoleName = email && INITIAL_ADMIN_EMAILS.includes(email.toLowerCase())
    ? ADMIN_ROLE
    : MEMBER_ROLE;
  const role = await db.query.roles.findFirst({
    where: eq(roles.name, desiredRoleName),
  });
  if (!role) return;
  await db
    .insert(userRoles)
    .values({ userId, roleId: role.id })
    .onConflictDoNothing();
}

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // Google verifies email ownership at sign-in, so linking an existing
      // user record by email is safe with Google alone. If a fork adds a
      // second OAuth provider (GitHub, Microsoft, etc.) that does NOT verify
      // email, set this to `false` or the second provider can impersonate a
      // Google user by claiming their email.
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      name: "Email + Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const email = (credentials?.email as string | undefined)?.toLowerCase();
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        // Rate limit: 5/min keyed by ip:email composite.
        // NextAuth 5 beta passes the original Request as the second arg.
        // If headers are unavailable for any reason the key degrades to
        // "signin:unknown:<email>" — still a meaningful per-email limit.
        const ip = getRequestIp(
          (request as Request | undefined)?.headers ?? new Headers(),
        );
        const limited = await checkRateLimit(
          `signin:${ip ?? "unknown"}:${email}`,
          { max: 5, windowSeconds: 60 },
          { userId: null, actor: email, reason: "credentials_signin" },
        );
        if (!limited.allowed) return null; // NextAuth surfaces CredentialsSignin

        const user = await db.query.users.findFirst({
          where: eq(users.email, email),
        });
        if (!user?.password || !user.isActive) return null;

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      // Block sign-in if the user row is missing or inactive. Returning `true`
      // on null would let a deleted user with a still-valid session re-create
      // themselves through the adapter — a privilege bypass.
      if (!user.id) return true; // brand-new OAuth user; adapter will create
      const dbUser = await db.query.users.findFirst({
        where: eq(users.id, user.id),
        columns: { isActive: true },
      });
      if (!dbUser) return false;
      return dbUser.isActive;
    },
    // The `session` callback lives in the shared authConfig so the edge
    // runtime (proxy.ts) sees the same projection.
    async jwt({ token, user, trigger, session }) {
      // `user` is only present on the initial sign-in (Google callback or a
      // successful Credentials authorize). Subsequent requests carry the JWT
      // cookie only, so this block runs exactly once per session.
      if (user?.id) {
        token.sub = user.id;
        token.twoFactorVerified = false;
        // Force a roles refresh on first sign-in. NextAuth's `createUser`
        // event runs fire-and-forget for OAuth users (the JWT callback can
        // race ahead of it), and Credentials sign-ins never fire it at all,
        // so we ensure the default role assignment + role load happen here
        // synchronously below.
        token.roles = undefined;
        await ensureDefaultRole(user.id, user.email ?? null);
        await db
          .update(users)
          .set({ lastLoginAt: new Date() })
          .where(eq(users.id, user.id));
      }

      // Server-action-triggered updates (e.g. 2FA verified, role assigned)
      // call `unstable_update`; we merge the partial session payload back into
      // the token here so subsequent requests see the new state.
      if (trigger === "update" && session?.user) {
        if (typeof session.user.twoFactorVerified === "boolean") {
          token.twoFactorVerified = session.user.twoFactorVerified;
        }
        if (Array.isArray(session.user.roles)) {
          token.roles = session.user.roles;
        }
        if (Array.isArray(session.user.features)) {
          token.features = session.user.features;
        }
      }

      // Stale-JWT defense + role refresh.
      //
      // We hit the DB on every authenticated request to verify the user row
      // still exists and is active. That's one cheap SELECT, and it's the
      // only thing standing between a deleted/deactivated user and a still-
      // valid signed cookie. For role + feature changes to apply mid-session,
      // call `unstable_update({})` from the mutating action; this re-runs
      // the role lookup below.
      if (!token.sub) return token;

      const userId = token.sub;
      const dbUser = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { isActive: true, twoFactorRequired: true, email: true },
      });
      if (!dbUser || !dbUser.isActive) {
        // Row vanished or got deactivated. Returning an empty token signs
        // the user out on the next request.
        return {};
      }
      token.isActive = dbUser.isActive;
      token.twoFactorRequired = dbUser.twoFactorRequired;
      if (dbUser.email) token.email = dbUser.email;

      const needsRoleRefresh = !token.roles || trigger === "update" || !!user;
      if (needsRoleRefresh) {
        const roleRows = await db
          .select({ name: roles.name })
          .from(userRoles)
          .innerJoin(roles, eq(userRoles.roleId, roles.id))
          .where(eq(userRoles.userId, userId))
          .orderBy(roles.sortOrder);
        const roleNames = roleRows.map((r) => r.name);
        token.roles = roleNames;

        if (roleNames.includes(ADMIN_ROLE)) {
          // Admins receive every key in the static FEATURE_CATALOG, not every
          // row in the `features` table. The DB is *not* the source of truth
          // for the admin grant — the code is. This protects against stale
          // rows leaking in and missing rows leaving admins under-privileged.
          token.features = FEATURE_KEYS;
        } else if (roleNames.length > 0) {
          const featRows = await db
            .selectDistinct({ key: features.key })
            .from(roleFeatures)
            .innerJoin(roles, eq(roleFeatures.roleId, roles.id))
            .innerJoin(userRoles, eq(userRoles.roleId, roles.id))
            .innerJoin(features, eq(roleFeatures.featureKey, features.key))
            .where(eq(userRoles.userId, userId));
          token.features = featRows.map((f) => f.key);
        } else {
          token.features = [];
        }
      }
      return token;
    },
  },
});
