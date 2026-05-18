import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  userTotp,
  userTotpRecoveryCodes,
} from "@/lib/db/schema";
import { FRESH_RECOVERY_CODES_COOKIE } from "@/lib/two-factor";
import {
  getOrCreatePendingEnrollment,
  PENDING_TTL_MINUTES,
} from "@/lib/totp-pending";
import { regenerateRecoveryCodes } from "./actions";
import { TotpEnrollForm } from "./totp-enroll-form";
import { RegenerateCodesForm } from "./regenerate-codes-form";
import { FormattedDate } from "@/components/shared/formatted-date";

async function consumeFreshCodesCookie(): Promise<string[] | null> {
  const jar = await cookies();
  const raw = jar.get(FRESH_RECOVERY_CODES_COOKIE)?.value;
  if (!raw) return null;
  jar.delete(FRESH_RECOVERY_CODES_COOKIE);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === "string")
      : null;
  } catch {
    return null;
  }
}

export default async function AccountTwoFactorPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin?callbackUrl=/account/2fa");

  const [existing, freshCodes] = await Promise.all([
    db.query.userTotp.findFirst({
      where: eq(userTotp.userId, session.user.id),
    }),
    consumeFreshCodesCookie(),
  ]);

  // Already enrolled — show management view
  if (existing) {
    const recoveryRows = await db.query.userTotpRecoveryCodes.findMany({
      where: eq(userTotpRecoveryCodes.userId, session.user.id),
    });
    const totalCodes = recoveryRows.length;
    const unusedCount = recoveryRows.filter((c) => !c.usedAt).length;

    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-semibold">Two-factor authentication</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You enrolled on{" "}
          <FormattedDate value={existing.enrolledAt} mode="date" />.
          {existing.lastUsedAt && (
            <> Last used: <FormattedDate value={existing.lastUsedAt} mode="datetime" />.</>
          )}
        </p>

        {freshCodes && (
          <div className="mt-6 rounded-md border border-amber-500/40 bg-amber-500/10 p-4">
            <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              Save these recovery codes
            </h2>
            <p className="mt-1 text-xs">
              Each code lets you sign in once if you lose your authenticator.
              We hash codes at rest — this is the only time you&apos;ll see
              them in plaintext.
            </p>
            <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm">
              {freshCodes.map((c) => (
                <li key={c} className="rounded bg-background px-2 py-1">
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 rounded-md border border-border p-4">
          <h2 className="text-sm font-semibold">Recovery codes</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {unusedCount} unused code{unusedCount === 1 ? "" : "s"} remaining
            (of {totalCodes} total).
          </p>
          <RegenerateCodesForm />
        </div>
      </div>
    );
  }

  // Not enrolled — reuse the pending row if it's still valid, otherwise mint
  // a new one.  Reusing the row keeps the QR code stable across page reloads
  // within the TTL window so the user's authenticator app stays in sync.
  const enrollData = await getOrCreatePendingEnrollment(
    session.user.id,
    session.user.email ?? "user@example.com",
  );

  return (
    <TotpEnrollForm
      uri={enrollData.uri}
      secret={enrollData.secret}
      pendingTtlMinutes={PENDING_TTL_MINUTES}
    />
  );
}
