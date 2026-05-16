"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth, unstable_update } from "@/auth";
import { db } from "@/lib/db";
import { userTotp } from "@/lib/db/schema";
import { decryptSecret, verifyToken } from "@/lib/two-factor";

export async function verifyTotpAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const token = String(formData.get("token") ?? "");
  const callbackUrl = String(formData.get("callbackUrl") ?? "/admin");

  const enrollment = await db.query.userTotp.findFirst({
    where: eq(userTotp.userId, session.user.id),
  });
  if (!enrollment) redirect("/admin/2fa");

  const ok = verifyToken(token, decryptSecret(enrollment.secretCiphertext));
  if (!ok) {
    const url = new URL("/totp", "http://placeholder");
    url.searchParams.set("error", "invalid");
    url.searchParams.set("callbackUrl", callbackUrl);
    redirect(url.pathname + "?" + url.searchParams.toString());
  }

  await db
    .update(userTotp)
    .set({ lastUsedAt: new Date() })
    .where(eq(userTotp.userId, session.user.id));

  await unstable_update({ user: { twoFactorVerified: true } });
  redirect(callbackUrl);
}
