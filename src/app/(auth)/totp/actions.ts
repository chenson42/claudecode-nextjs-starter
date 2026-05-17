"use server";

import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { auth, unstable_update } from "@/auth";
import { db } from "@/lib/db";
import {
  auditEvents,
  userTotp,
  userTotpRecoveryCodes,
} from "@/lib/db/schema";
import {
  decryptSecret,
  hashRecoveryCode,
  normalizeRecoveryCode,
  verifyToken,
} from "@/lib/two-factor";
import { checkRateLimit } from "@/lib/rate-limit";

function totpRedirectUrl(callbackUrl: string, error?: "invalid" | "rate_limited"): string {
  const params = new URLSearchParams({ callbackUrl });
  if (error) params.set("error", error);
  return `/totp?${params.toString()}`;
}

async function logAttempt(
  userId: string,
  email: string | null | undefined,
  action: string,
  metadata: Record<string, unknown> = {},
) {
  await db.insert(auditEvents).values({
    actorUserId: userId,
    actorEmail: email,
    action,
    resourceType: "user",
    resourceId: userId,
    metadata,
  });
}

export async function verifyTotpAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const rawInput = String(formData.get("token") ?? "");
  const callbackUrl = String(formData.get("callbackUrl") ?? "/admin");

  const enrollment = await db.query.userTotp.findFirst({
    where: eq(userTotp.userId, session.user.id),
  });
  if (!enrollment) redirect("/admin/2fa");

  // Rate limit: 10/min by userId.
  // Rejection travels via redirect query param because this action always uses
  // redirect() rather than returning an ActionResult. retryAfterSeconds is NOT
  // forwarded — the UX copy is intentionally vague ("wait a moment") for the
  // short 1-minute window.
  const limited = await checkRateLimit(
    `totp:${session.user.id}`,
    { max: 10, windowSeconds: 60 },
    {
      userId: session.user.id,
      actor: session.user.email ?? session.user.id,
      reason: "totp_verify",
    },
  );
  if (!limited.allowed) redirect(totpRedirectUrl(callbackUrl, "rate_limited"));

  const trimmed = rawInput.trim();
  const isSixDigit = /^\d{6}$/.test(trimmed);

  if (isSixDigit) {
    const ok = verifyToken(trimmed, decryptSecret(enrollment.secretCiphertext));
    if (!ok) {
      await logAttempt(session.user.id, session.user.email, "totp.verify_failed");
      redirect(totpRedirectUrl(callbackUrl, "invalid"));
    }
    await db
      .update(userTotp)
      .set({ lastUsedAt: new Date() })
      .where(eq(userTotp.userId, session.user.id));
    await logAttempt(session.user.id, session.user.email, "totp.verify_succeeded");
    await unstable_update({ user: { twoFactorVerified: true } });
    redirect(callbackUrl);
  }

  // Try as recovery code.
  const normalized = normalizeRecoveryCode(trimmed);
  if (!normalized) {
    await logAttempt(session.user.id, session.user.email, "totp.verify_failed", {
      reason: "malformed_input",
    });
    redirect(totpRedirectUrl(callbackUrl, "invalid"));
  }
  const hash = hashRecoveryCode(normalized);
  const match = await db.query.userTotpRecoveryCodes.findFirst({
    where: and(
      eq(userTotpRecoveryCodes.userId, session.user.id),
      eq(userTotpRecoveryCodes.codeHash, hash),
      isNull(userTotpRecoveryCodes.usedAt),
    ),
  });
  if (!match) {
    await logAttempt(session.user.id, session.user.email, "totp.recovery_failed");
    redirect(totpRedirectUrl(callbackUrl, "invalid"));
  }
  await db
    .update(userTotpRecoveryCodes)
    .set({ usedAt: new Date() })
    .where(eq(userTotpRecoveryCodes.id, match.id));
  await logAttempt(session.user.id, session.user.email, "totp.recovery_succeeded", {
    codeId: match.id,
  });
  await unstable_update({ user: { twoFactorVerified: true } });
  redirect(callbackUrl);
}
