import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Claude Code Starter",
  description:
    "Fork-and-go Next.js + Neon + NextAuth starter with admin, roles, TOTP 2FA, feature flags, and release notes.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
