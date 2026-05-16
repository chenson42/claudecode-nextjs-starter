import {
  pgTable,
  text,
  uuid,
  timestamp,
  boolean,
  integer,
  primaryKey,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// NextAuth adapter tables. snake_case property names are required by
// @auth/drizzle-adapter — do not rename.

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  password: text("password"),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  twoFactorRequired: boolean("two_factor_required").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// Roles → features (permissions). Multiple roles per user. Each role grants
// a set of features. Features are the unit checked at runtime.

export const roles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userRoles = pgTable(
  "user_roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("ix_user_roles_user_role").on(t.userId, t.roleId)],
);

export const features = pgTable("features", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(),
});

export const roleFeatures = pgTable(
  "role_features",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    featureKey: text("feature_key")
      .notNull()
      .references(() => features.key, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("ix_role_features_role_feature").on(t.roleId, t.featureKey),
  ],
);

// TOTP 2FA. Secret stored AES-256-GCM encrypted; see src/lib/two-factor.

export const userTotp = pgTable("user_totp", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  secretCiphertext: text("secret_ciphertext").notNull(),
  enrolledAt: timestamp("enrolled_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

export const userTotpRecoveryCodes = pgTable(
  "user_totp_recovery_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [index("ix_recovery_user").on(t.userId)],
);

export const userTotpTrustedDevices = pgTable(
  "user_totp_trusted_devices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    label: text("label"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("ix_trusted_user").on(t.userId),
    uniqueIndex("ix_trusted_token").on(t.tokenHash),
  ],
);

// Feature flags — distinct from permissions. Permissions are "is this user
// allowed to use feature X". Flags are "is feature X on for this environment
// (or this cohort)". Same word, different concept.

export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(false),
  rolloutPercent: integer("rollout_percent").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Append-only audit log for security-sensitive actions.

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ix_audit_actor").on(t.actorUserId),
    index("ix_audit_action_time").on(t.action, t.createdAt),
  ],
);

export const migrationSeeds = pgTable("migration_seeds", {
  key: text("key").primaryKey(),
  appliedAt: timestamp("applied_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Relations

export const usersRelations = relations(users, ({ many, one }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  roles: many(userRoles),
  totp: one(userTotp, {
    fields: [users.id],
    references: [userTotp.userId],
  }),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  userRoles: many(userRoles),
  roleFeatures: many(roleFeatures),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
}));

export const roleFeaturesRelations = relations(roleFeatures, ({ one }) => ({
  role: one(roles, { fields: [roleFeatures.roleId], references: [roles.id] }),
  feature: one(features, {
    fields: [roleFeatures.featureKey],
    references: [features.key],
  }),
}));
