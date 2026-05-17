"use server";

import { headers } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { users, passwordResetTokens, auditEvents } from "@/lib/db/schema";
import { AUDIT_ACTIONS } from "@/lib/audit";
import { sendPasswordResetEmail } from "@/lib/email";
import { getRequestIp, checkRateLimit } from "@/lib/rate-limit";
import type { ActionResult } from "@/types/actions";

function sha256Hex(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// ---------------------------------------------------------------------------
// requestPasswordReset
//
// Always returns { ok: true } — enumeration-safe.
// Mints a token only for Credentials users (password != null).
// Google-only accounts (password === null) receive a silent no-op.
// ---------------------------------------------------------------------------

export async function requestPasswordReset(input: {
  email: string;
}): Promise<ActionResult> {
  // Rate limit: 5/hour by IP.
  // NOTE: Unlike the rest of this function, returning { ok: false } here does
  // NOT expose email existence — the block fires on IP regardless of whether
  // the submitted email belongs to a real account. This deliberate deviation
  // from the always-{ ok:true } pattern is safe for IP-keyed limits.
  const hdrs = await headers();
  const ip = getRequestIp(hdrs);
  const limited = await checkRateLimit(
    `pwreset_req:${ip ?? "unknown"}`,
    { max: 5, windowSeconds: 3600 },
    { userId: null, actor: ip ?? "unknown", reason: "password_reset_request" },
  );
  if (!limited.allowed) {
    const mins = Math.ceil(limited.retryAfterSeconds / 60);
    return {
      ok: false,
      error: `Too many requests. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
    };
  }

  const email = input.email.trim().toLowerCase();

  const userRow = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true, email: true, password: true },
  });

  // Silent no-op for unknown email or Google-only accounts (no local password).
  // The caller always receives { ok: true } to prevent email enumeration.
  if (!userRow || !userRow.password) {
    return { ok: true };
  }

  // Generate a CSPRNG raw token — this is what travels in the email URL.
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60 minutes

  // Delete any existing in-flight reset token for this user (one per user).
  // The uniqueIndex("ix_pwd_reset_user") on userId enforces this at the DB level.
  await db
    .delete(passwordResetTokens)
    .where(eq(passwordResetTokens.userId, userRow.id));

  await db.insert(passwordResetTokens).values({
    userId: userRow.id,
    token: tokenHash,
    expiresAt,
  });

  await sendPasswordResetEmail(userRow.email, rawToken);

  await db.insert(auditEvents).values({
    actorUserId: userRow.id,
    actorEmail: userRow.email,
    action: AUDIT_ACTIONS.USER_PASSWORD_RESET_REQUESTED,
    resourceType: "user",
    resourceId: userRow.id,
    metadata: { email: userRow.email },
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// consumeResetToken
//
// Validates rawToken, then in a single transaction:
//   - bcrypt-hashes the new password
//   - updates users.password
//   - deletes the token row
//   - writes USER_PASSWORD_RESET_COMPLETED audit event
// ---------------------------------------------------------------------------

export async function consumeResetToken(input: {
  rawToken: string;
  newPassword: string;
}): Promise<ActionResult> {
  if (input.newPassword.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  // Rate limit: 10/hour keyed by token-hash (not IP).
  // Token-hash keying limits brute-force to 10 guesses per token regardless
  // of attacker IP. Expiry + single-use deletion remain the primary controls;
  // this is defense-in-depth.
  const tokenHash = sha256Hex(input.rawToken);
  const limited = await checkRateLimit(
    `pwreset_consume:${tokenHash}`,
    { max: 10, windowSeconds: 3600 },
    {
      userId: null,
      actor: tokenHash.slice(0, 8),
      reason: "reset_token_consume",
    },
  );
  if (!limited.allowed) {
    const mins = Math.ceil(limited.retryAfterSeconds / 60);
    return {
      ok: false,
      error: `Too many attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
    };
  }

  const tokenRow = await db.query.passwordResetTokens.findFirst({
    where: eq(passwordResetTokens.token, tokenHash),
  });

  if (!tokenRow) {
    return { ok: false, error: "Invalid or expired reset link." };
  }

  if (tokenRow.expiresAt < new Date()) {
    // Clean up the stale row, then report expiry.
    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.id, tokenRow.id));
    return {
      ok: false,
      error: "This link has expired. Request a new one.",
    };
  }

  const userRow = await db.query.users.findFirst({
    where: eq(users.id, tokenRow.userId),
    columns: { id: true, email: true },
  });

  if (!userRow) {
    return { ok: false, error: "Account not found." };
  }

  const hashed = await hash(input.newPassword, 10);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ password: hashed })
      .where(eq(users.id, userRow.id));

    await tx
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.id, tokenRow.id));

    await tx.insert(auditEvents).values({
      actorUserId: userRow.id,
      actorEmail: userRow.email,
      action: AUDIT_ACTIONS.USER_PASSWORD_RESET_COMPLETED,
      resourceType: "user",
      resourceId: userRow.id,
      metadata: { via: "reset_token" },
    });
  });

  return { ok: true };
}
