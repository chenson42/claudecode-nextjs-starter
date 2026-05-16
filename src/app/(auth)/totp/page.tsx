import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { userTotp } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifyTotpAction } from "./actions";

export default async function TotpPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const sp = await searchParams;
  const callbackUrl = sp.callbackUrl ?? "/admin";

  const enrollment = await db.query.userTotp.findFirst({
    where: eq(userTotp.userId, session.user.id),
  });

  return (
    <main className="mx-auto max-w-sm px-6 py-24">
      <h1 className="text-2xl font-semibold">Two-factor authentication</h1>
      {!enrollment ? (
        <p className="mt-4 text-sm text-muted-foreground">
          You haven&apos;t enrolled in 2FA yet. Visit{" "}
          <a className="underline" href="/admin/2fa">
            /admin/2fa
          </a>{" "}
          to set up your authenticator app, then come back here.
        </p>
      ) : (
        <form action={verifyTotpAction} className="mt-6 space-y-3">
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <label className="block text-sm font-medium">6-digit code</label>
          <input
            name="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            required
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-base tracking-widest"
            placeholder="123456"
            autoFocus
          />
          {sp.error === "invalid" && (
            <p className="text-sm text-red-500">
              That code didn&apos;t match. Try again.
            </p>
          )}
          <button
            type="submit"
            className="w-full rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            Verify
          </button>
        </form>
      )}
    </main>
  );
}
