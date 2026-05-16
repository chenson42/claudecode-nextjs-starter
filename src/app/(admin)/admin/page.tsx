import Link from "next/link";
import { auth } from "@/auth";

export default async function AdminDashboard() {
  const session = await auth();
  const cards = [
    {
      href: "/admin/users",
      title: "Users & roles",
      blurb: "Assign roles to users.",
    },
    {
      href: "/admin/flags",
      title: "Feature flags",
      blurb: "Toggle environment features.",
    },
    {
      href: "/admin/docs",
      title: "Release notes",
      blurb: "What shipped, when.",
    },
    {
      href: "/admin/2fa",
      title: "Your 2FA",
      blurb: "Enroll or rotate your authenticator.",
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold">Welcome, {session?.user?.name ?? "admin"}.</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Roles: {session?.user?.roles?.join(", ") || "—"}
      </p>
      <div className="mt-8 grid grid-cols-2 gap-4">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-lg border border-border p-5 hover:bg-muted"
          >
            <div className="font-medium">{c.title}</div>
            <div className="mt-1 text-sm text-muted-foreground">{c.blurb}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
