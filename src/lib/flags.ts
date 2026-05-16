import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { featureFlags } from "@/lib/db/schema";

export async function isFlagEnabled(key: string): Promise<boolean> {
  const row = await db.query.featureFlags.findFirst({
    where: eq(featureFlags.key, key),
  });
  return row?.enabled ?? false;
}
