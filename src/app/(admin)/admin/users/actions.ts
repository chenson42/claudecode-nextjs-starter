"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth, unstable_update } from "@/auth";
import { db } from "@/lib/db";
import { roles, userRoles, auditEvents } from "@/lib/db/schema";
import { ADMIN_ROLE } from "@/lib/permissions";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.roles?.includes(ADMIN_ROLE)) {
    throw new Error("Forbidden");
  }
  return session;
}

// If the role change targets the actor's own user row, refresh their JWT so
// the change takes effect immediately rather than at next sign-in. For
// changes targeting other users, the affected user's JWT stays stale until
// their next sign-in or until something calls `unstable_update` in their
// session context.
async function refreshSelfIfNeeded(actorId: string, targetUserId: string) {
  if (actorId === targetUserId) {
    await unstable_update({});
  }
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

  await refreshSelfIfNeeded(session.user.id, userId);
  revalidatePath("/admin/users");
}

export async function removeRoleAction(formData: FormData) {
  const session = await requireAdmin();
  const userId = String(formData.get("userId"));
  const roleName = String(formData.get("roleName"));

  const role = await db.query.roles.findFirst({
    where: eq(roles.name, roleName),
  });
  if (!role) throw new Error(`Unknown role: ${roleName}`);

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

  await refreshSelfIfNeeded(session.user.id, userId);
  revalidatePath("/admin/users");
}
