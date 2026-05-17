import Link from "next/link";
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
        Continue with Google, or sign in with the seeded admin credentials for
        local testing.
      </p>

      {sp.error === "deactivated" && (
        <p className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm">
          This account has been deactivated. Contact an administrator.
        </p>
      )}
      {sp.error === "CredentialsSignin" && (
        <p className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm">
          Wrong email or password.
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

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <form
        action={async (formData: FormData) => {
          "use server";
          await signIn("credentials", {
            email: formData.get("email"),
            password: formData.get("password"),
            redirectTo: callbackUrl,
          });
        }}
        className="space-y-3"
      >
        <div>
          <label htmlFor="signin-email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="signin-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="admin@claudecode.info"
          />
        </div>
        <div>
          <label htmlFor="signin-password" className="block text-sm font-medium">
            Password
          </label>
          <input
            id="signin-password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Sign in with email
        </button>
        <div className="text-right">
          <Link
            href="/forgot-password"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
      </form>

      <p className="mt-4 text-xs text-muted-foreground">
        First time? Run <code>npm run db:seed</code> to provision the seeded
        admin user.
      </p>
    </main>
  );
}
