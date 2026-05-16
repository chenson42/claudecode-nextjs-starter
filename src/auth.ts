import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
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

const INITIAL_ADMIN_EMAILS = (process.env.INITIAL_ADMIN_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      if (!user.id) return true;
      const dbUser = await db.query.users.findFirst({
        where: eq(users.id, user.id),
        columns: { isActive: true },
      });
      if (!dbUser) return true;
      return dbUser.isActive;
    },
    async session({ session, token }) {
      if (token?.sub) {
        session.user.id = token.sub;
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
      if (user?.id) {
        token.sub = user.id;
        token.twoFactorVerified = false;
        await db
          .update(users)
          .set({ lastLoginAt: new Date() })
          .where(eq(users.id, user.id));
      }

      if (trigger === "update" && session?.user) {
        if (typeof session.user.twoFactorVerified === "boolean") {
          token.twoFactorVerified = session.user.twoFactorVerified;
        }
      }

      if (token.sub && (!token.roles || trigger === "update")) {
        const userId = token.sub;
        const dbUser = await db.query.users.findFirst({
          where: eq(users.id, userId),
          columns: { isActive: true, twoFactorRequired: true, email: true },
        });
        token.isActive = dbUser?.isActive ?? true;
        token.twoFactorRequired = dbUser?.twoFactorRequired ?? true;

        const roleRows = await db
          .select({ name: roles.name })
          .from(userRoles)
          .innerJoin(roles, eq(userRoles.roleId, roles.id))
          .where(eq(userRoles.userId, userId))
          .orderBy(roles.sortOrder);
        const roleNames = roleRows.map((r) => r.name);
        token.roles = roleNames;

        if (roleNames.includes("admin")) {
          const all = await db.select({ key: features.key }).from(features);
          token.features = all.map((f) => f.key);
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
    async createUser({ user }) {
      if (!user.id || !user.email) return;
      const desiredRole = INITIAL_ADMIN_EMAILS.includes(
        user.email.toLowerCase(),
      )
        ? "admin"
        : "member";
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
