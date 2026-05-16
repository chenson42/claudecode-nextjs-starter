import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as schema from "../src/lib/db/schema";
import { FEATURE_CATALOG, FEATURES } from "../src/lib/permissions";

if (!process.env.DATABASE_URL) {
  throw new Error("Set DATABASE_URL in .env.local before running the seed.");
}

const initialAdmins = (process.env.INITIAL_ADMIN_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

if (initialAdmins.length === 0) {
  console.warn(
    "[seed] INITIAL_ADMIN_EMAILS is empty — the first sign-in won't auto-receive the admin role. " +
      "Set a comma-separated list in .env.local (e.g. you@example.com,teammate@example.com) before signing in.",
  );
} else {
  console.log(`[seed] Will auto-admin on first sign-in: ${initialAdmins.join(", ")}`);
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql, { schema });

async function seedRoles() {
  const defs = [
    { name: "admin", displayName: "Admin", isSystem: true, sortOrder: 0 },
    { name: "member", displayName: "Member", isSystem: true, sortOrder: 100 },
  ];
  for (const r of defs) {
    await db.insert(schema.roles).values(r).onConflictDoNothing();
  }
  console.log("seeded roles");
}

async function seedFeatures() {
  for (const f of FEATURE_CATALOG) {
    await db.insert(schema.features).values(f).onConflictDoNothing();
  }
  console.log(`seeded ${FEATURE_CATALOG.length} features`);
}

async function seedFlags() {
  const defaults = [
    {
      key: "demo.new_dashboard",
      description: "Demo flag wired into /admin to show the pattern.",
      enabled: false,
    },
  ];
  for (const f of defaults) {
    await db.insert(schema.featureFlags).values(f).onConflictDoNothing();
  }
  console.log(`seeded ${defaults.length} feature flags`);
}

async function bindAdminFeatures() {
  const admin = await db.query.roles.findFirst({
    where: eq(schema.roles.name, "admin"),
  });
  if (!admin) return;
  for (const key of Object.values(FEATURES)) {
    await db
      .insert(schema.roleFeatures)
      .values({ roleId: admin.id, featureKey: key })
      .onConflictDoNothing();
  }
  console.log("bound all features to admin");
}

async function seedLocalAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "").toLowerCase().trim();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";

  if (!email || !password) {
    console.warn(
      "[seed] SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping local admin seed. " +
        "Set both in .env.local to provision a credentials-login admin for testing.",
    );
    return;
  }

  const hash = await bcrypt.hash(password, 10);

  // Upsert the user. Password updates on each run so you can rotate it via
  // .env.local without manual DB surgery.
  const existing = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });

  let userId: string;
  if (existing) {
    await db
      .update(schema.users)
      .set({
        password: hash,
        isActive: true,
        twoFactorRequired: false,
        name: existing.name ?? "Local Admin",
      })
      .where(eq(schema.users.id, existing.id));
    userId = existing.id;
    console.log(`[seed] updated local admin: ${email}`);
  } else {
    const [created] = await db
      .insert(schema.users)
      .values({
        email,
        name: "Local Admin",
        password: hash,
        emailVerified: new Date(),
        twoFactorRequired: false,
      })
      .returning({ id: schema.users.id });
    userId = created.id;
    console.log(`[seed] created local admin: ${email}`);
  }

  const adminRole = await db.query.roles.findFirst({
    where: eq(schema.roles.name, "admin"),
  });
  if (adminRole) {
    await db
      .insert(schema.userRoles)
      .values({ userId, roleId: adminRole.id })
      .onConflictDoNothing();
    console.log("[seed] bound local admin to admin role");
  }
}

async function main() {
  await seedRoles();
  await seedFeatures();
  await seedFlags();
  await bindAdminFeatures();
  await seedLocalAdmin();
  console.log("done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
