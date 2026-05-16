import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { FEATURES } from "@/lib/permissions";

const PUBLIC_PATHS = new Set([
  "/",
  "/signin",
  "/totp",
  "/access-pending",
  "/robots.txt",
  "/sitemap.xml",
]);

const PROTECTION_RULES: Array<{ pattern: RegExp; required: string }> = [
  { pattern: /^\/admin\/users/, required: FEATURES.ADMIN_USERS },
  { pattern: /^\/admin\/roles/, required: FEATURES.ADMIN_ROLES },
  { pattern: /^\/admin\/flags/, required: FEATURES.ADMIN_FLAGS },
  { pattern: /^\/admin\/docs/, required: FEATURES.ADMIN_RELEASE_NOTES },
  { pattern: /^\/admin/, required: FEATURES.ADMIN_DASHBOARD },
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/")) return NextResponse.next();
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const session = await auth();
  if (!session?.user) {
    const url = new URL("/signin", req.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
  if (session.user.isActive === false) {
    const url = new URL("/signin", req.url);
    url.searchParams.set("error", "deactivated");
    return NextResponse.redirect(url);
  }

  const isAdminRoute = pathname.startsWith("/admin");
  if (
    isAdminRoute &&
    session.user.twoFactorRequired &&
    !session.user.twoFactorVerified
  ) {
    const url = new URL("/totp", req.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  if (session.user.roles?.includes("admin")) return NextResponse.next();

  for (const rule of PROTECTION_RULES) {
    if (rule.pattern.test(pathname)) {
      const ok = session.user.features?.includes(rule.required);
      if (!ok) {
        return NextResponse.redirect(new URL("/access-pending", req.url));
      }
      return NextResponse.next();
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
