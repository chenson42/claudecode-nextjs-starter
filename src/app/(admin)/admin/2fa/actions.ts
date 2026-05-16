"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth, unstable_update } from "@/auth";
import { db } from "@/lib/db";
import { userTotp, auditEvents } from "@/lib/db/schema";
import { verifyToken } from "@/lib/two-factor";

export async function confirmEnrollmentAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const token = String(formData.get("token") ?? "");
  const ciphertext = String(formData.get("ciphertext") ?? "");
  const plain = String(formData.get("plain") ?? "");

  if (!verifyToken(token, plain)) {
    throw new Error("Code didn't match — try again.");
  }

  await db
    .insert(userTotp)
    .values({ userId: session.user.id, secretCiphertext: ciphertext })
    .onConflictDoUpdate({
      target: userTotp.userId,
      set: { secretCiphertext: ciphertext, enrolledAt: new Date() },
    });

  await db.insert(auditEvents).values({
    actorUserId: session.user.id,
    actorEmail: session.user.email,
    action: "totp.enrolled",
    resourceType: "user",
    resourceId: session.user.id,
  });

  await unstable_update({ user: { twoFactorVerified: true } });
  revalidatePath("/admin/2fa");
  redirect("/admin");
}

export async function resetEnrollmentAction() {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  await db.delete(userTotp).where(eq(userTotp.userId, session.user.id));
  await db.insert(auditEvents).values({
    actorUserId: session.user.id,
    actorEmail: session.user.email,
    action: "totp.reset",
    resourceType: "user",
    resourceId: session.user.id,
  });

  await unstable_update({ user: { twoFactorVerified: false } });
  revalidatePath("/admin/2fa");
}
