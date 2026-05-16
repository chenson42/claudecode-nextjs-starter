import { signIn } from "@/auth";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const callbackUrl = sp.callbackUrl ?? "/admin";

  return (
    <main className="mx-auto max-w-sm px-6 py-24">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Continue with your Google account.
      </p>
      {sp.error === "deactivated" && (
        <p className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm">
          This account has been deactivated. Contact an administrator.
        </p>
      )}
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: callbackUrl });
        }}
        className="mt-6"
      >
        <button
          type="submit"
          className="w-full rounded-md border border-border bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          Sign in with Google
        </button>
      </form>
    </main>
  );
}
