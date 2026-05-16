import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { userTotp } from "@/lib/db/schema";
import { encryptSecret, generateSecret, otpauthUrl } from "@/lib/two-factor";
import { confirmEnrollmentAction, resetEnrollmentAction } from "./actions";

export default async function TwoFactorPage() {
  const session = await auth();
  if (!session?.user) return null;

  const existing = await db.query.userTotp.findFirst({
    where: eq(userTotp.userId, session.user.id),
  });

  if (existing) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-semibold">Two-factor authentication</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You enrolled on{" "}
          {new Date(existing.enrolledAt).toLocaleDateString()}.
          {existing.lastUsedAt && (
            <> Last used: {new Date(existing.lastUsedAt).toLocaleString()}.</>
          )}
        </p>
        <form action={resetEnrollmentAction} className="mt-6">
          <button
            type="submit"
            className="rounded-md border border-red-500/40 px-3 py-1.5 text-sm text-red-600 hover:bg-red-500/10"
          >
            Reset 2FA enrollment
          </button>
          <p className="mt-2 text-xs text-muted-foreground">
            You&apos;ll be asked to re-scan the QR code on your next visit.
          </p>
        </form>
      </div>
    );
  }

  // Generate a fresh secret for enrollment. We encrypt at rest immediately;
  // the plaintext only lives on this server-rendered page and gets posted back
  // via the hidden field on confirm.
  const secret = generateSecret();
  const otpUrl = otpauthUrl(session.user.email ?? "user@example.com", secret);
  const qrDataUrl = await QRCode.toDataURL(otpUrl);
  const ciphertext = encryptSecret(secret);

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold">Enroll in 2FA</h1>
      <ol className="mt-4 space-y-2 text-sm">
        <li>1. Install an authenticator app (Google Authenticator, 1Password, Authy).</li>
        <li>2. Scan this QR code:</li>
      </ol>
      <img
        src={qrDataUrl}
        alt="TOTP QR code"
        className="mt-4 h-48 w-48 rounded border border-border bg-white p-2"
      />
      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Can&apos;t scan? Enter manually</summary>
        <pre className="mt-2 rounded bg-muted p-2 font-mono">{secret}</pre>
      </details>
      <form action={confirmEnrollmentAction} className="mt-6 space-y-3">
        <input type="hidden" name="ciphertext" value={ciphertext} />
        <input type="hidden" name="plain" value={secret} />
        <label className="block text-sm font-medium">
          Enter the 6-digit code from your app
        </label>
        <input
          name="token"
          inputMode="numeric"
          pattern="[0-9]{6}"
          required
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-base tracking-widest"
          placeholder="123456"
        />
        <button
          type="submit"
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          Confirm enrollment
        </button>
      </form>
    </div>
  );
}
