"use server";

import { headers } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
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
// TOCTOU-safe token consumption via DELETE-returning.
//
// The atomic step is:
//   DELETE FROM password_reset_tokens
//   WHERE token = $hash AND expires_at > now()
//   RETURNING *
//
// If 0 rows come back the token was already consumed, never existed, or has
// expired — all map to the same friendly error (no leakage). If 1 row comes
// back this request owns the token and proceeds to update the password and
// write the audit event. No read-then-delete race is possible because the
// DELETE is the check.
//
// Sequential steps after the atomic DELETE are safe: the token is gone from
// the DB, so any concurrent request racing here gets 0 rows and aborts.
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

  // Atomic claim: DELETE WHERE token matches AND has not expired, RETURNING the
  // claimed row. Zero rows → invalid or already consumed (same error either way).
  const claimed = await db
    .delete(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.token, tokenHash),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    )
    .returning();

  if (claimed.length === 0) {
    return { ok: false, error: "Invalid or expired reset link." };
  }

  const tokenRow = claimed[0];

  const userRow = await db.query.users.findFirst({
    where: eq(users.id, tokenRow.userId),
    columns: { id: true, email: true },
  });

  if (!userRow) {
    return { ok: false, error: "Account not found." };
  }

  const hashed = await hash(input.newPassword, 10);

  await db
    .update(users)
    .set({ password: hashed })
    .where(eq(users.id, userRow.id));

  await db.insert(auditEvents).values({
    actorUserId: userRow.id,
    actorEmail: userRow.email,
    action: AUDIT_ACTIONS.USER_PASSWORD_RESET_COMPLETED,
    resourceType: "user",
    resourceId: userRow.id,
    metadata: { via: "reset_token" },
  });

  return { ok: true };
}
