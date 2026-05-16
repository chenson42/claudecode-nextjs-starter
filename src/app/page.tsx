import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <h1 className="text-4xl font-bold tracking-tight">Claude Code Starter</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        A fork-and-go Next.js + Neon + NextAuth starter with admin, roles &amp;
        permissions, TOTP 2FA, feature flags, and release notes. Designed as a
        teaching artifact for Claude Code workflows.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/signin"
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          Sign in
        </Link>
        <Link
          href="/admin"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Go to admin
        </Link>
      </div>
    </main>
  );
}
