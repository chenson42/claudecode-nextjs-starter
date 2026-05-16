import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { FEATURE_CATALOG, FEATURES } from "../src/lib/permissions";

if (!process.env.DATABASE_URL) {
  throw new Error("Set DATABASE_URL in .env.local before running the seed.");
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

await seedRoles();
await seedFeatures();
await seedFlags();
await bindAdminFeatures();
console.log("done.");
