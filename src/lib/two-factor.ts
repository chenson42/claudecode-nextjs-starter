import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { authenticator } from "otplib";

const ALGO = "aes-256-gcm";

function key(): Buffer {
  const k = process.env.AUTH_TOTP_ENCRYPTION_KEY;
  if (!k) throw new Error("AUTH_TOTP_ENCRYPTION_KEY is not set");
  const buf = Buffer.from(k, "base64");
  if (buf.length !== 32) {
    throw new Error("AUTH_TOTP_ENCRYPTION_KEY must decode to 32 bytes");
  }
  return buf;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptSecret(ciphertext: string): string {
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
    "utf8",
  );
}

export function generateSecret(): string {
  return authenticator.generateSecret();
}

export function otpauthUrl(email: string, secret: string, issuer = "Claude Code Starter"): string {
  return authenticator.keyuri(email, issuer, secret);
}

export function verifyToken(token: string, secret: string): boolean {
  return authenticator.verify({ token, secret });
}
