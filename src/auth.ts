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

const INITIAL_ADMIN_EMAILS = (process.env.INITIAL_ADMIN_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const FEATURE_KEYS = Object.values(FEATURES) as string[];

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
      async authorize(credentials) {
        const email = (credentials?.email as string | undefined)?.toLowerCase();
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

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
    async session({ session, token }) {
      if (token?.sub) {
        session.user.id = token.sub;
        // NextAuth's default session callback projects email + name + image
        // from the JWT, but be explicit: a forker who modifies this callback
        // should see every field they're responsible for setting.
        if (typeof token.email === "string") session.user.email = token.email;
        session.user.roles = (token.roles as string[]) ?? [];
        session.user.features = (token.features as string[]) ?? [];
        session.user.isActive = (token.isActive as boolean) ?? true;
        session.user.twoFactorRequired =
          (token.twoFactorRequired as boolean) ?? true;
        session.user.twoFactorVerified =
          (token.twoFactorVerified as boolean) ?? false;
      }
      return session;
    },
    async jwt({ token, user, trigger, session }) {
      // `user` is only present on the initial sign-in (Google callback or a
      // successful Credentials authorize). Subsequent requests carry the JWT
      // cookie only, so this block runs exactly once per session.
      if (user?.id) {
        token.sub = user.id;
        token.twoFactorVerified = false;
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

      // Refresh roles + features when the token is fresh, or when the caller
      // explicitly asks via `unstable_update({})`. The JWT is sticky between
      // these refreshes — role changes don't take effect for the affected
      // user until something fires `unstable_update` (admin actions do).
      const needsRefresh = !token.roles || trigger === "update";
      if (token.sub && needsRefresh) {
        const userId = token.sub;
        const dbUser = await db.query.users.findFirst({
          where: eq(users.id, userId),
          columns: { isActive: true, twoFactorRequired: true, email: true },
        });
        if (!dbUser) {
          // Row vanished mid-session. Drop the JWT.
          return {};
        }
        token.isActive = dbUser.isActive;
        token.twoFactorRequired = dbUser.twoFactorRequired;
        if (dbUser.email) token.email = dbUser.email;

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
  events: {
    // The DrizzleAdapter creates the `users` row on first OAuth sign-in but
    // leaves user_roles empty. Bind every brand-new OAuth user to a starter
    // role here. Credentials users skip this hook (no adapter call), which is
    // why the seed script wires the local admin to its role directly.
    async createUser({ user }) {
      if (!user.id || !user.email) return;
      const desiredRole = INITIAL_ADMIN_EMAILS.includes(
        user.email.toLowerCase(),
      )
        ? ADMIN_ROLE
        : MEMBER_ROLE;
      const role = await db.query.roles.findFirst({
        where: eq(roles.name, desiredRole),
      });
      if (!role) return;
      await db
        .insert(userRoles)
        .values({ userId: user.id, roleId: role.id })
        .onConflictDoNothing();
    },
  },
});
