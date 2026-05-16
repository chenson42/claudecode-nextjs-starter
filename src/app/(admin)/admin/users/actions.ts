"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { roles, userRoles, auditEvents } from "@/lib/db/schema";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.roles?.includes("admin")) {
    throw new Error("Forbidden");
  }
  return session;
}

export async function assignRoleAction(formData: FormData) {
  const session = await requireAdmin();
  const userId = String(formData.get("userId"));
  const roleId = String(formData.get("roleId"));

  await db
    .insert(userRoles)
    .values({ userId, roleId })
    .onConflictDoNothing();

  await db.insert(auditEvents).values({
    actorUserId: session.user.id,
    actorEmail: session.user.email,
    action: "user.role.assigned",
    resourceType: "user",
    resourceId: userId,
    metadata: { roleId },
  });

  revalidatePath("/admin/users");
}

export async function removeRoleAction(formData: FormData) {
  const session = await requireAdmin();
  const userId = String(formData.get("userId"));
  const roleName = String(formData.get("roleName"));

  const role = await db.query.roles.findFirst({
    where: eq(roles.name, roleName),
  });
  if (!role) return;

  await db
    .delete(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, role.id)));

  await db.insert(auditEvents).values({
    actorUserId: session.user.id,
    actorEmail: session.user.email,
    action: "user.role.removed",
    resourceType: "user",
    resourceId: userId,
    metadata: { roleName },
  });

  revalidatePath("/admin/users");
}
