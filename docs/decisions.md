# Decisions Log

Architectural and implementation decisions for the Claude Code Starter. Newest first. Each decision is numbered; the number does not change once assigned.

---

## DECISION-006: Forgot-password flow uses a separate `(password-reset)` route group

**Status:** Resolved
**Date:** 2026-05-17

**Decision:** The forgot-password flow (`/forgot-password`, `/reset-password`) lives in a new `src/app/(password-reset)/` route group rather than being merged into the existing `(email-verify)` group. The two public paths are added to `PUBLIC_PATHS` in `src/proxy.ts` (no prefix exception needed — the token is a query parameter, not a path segment).

**Rationale:** `(email-verify)` owns `/account/verify-email/[token]` — an authenticated-user flow where the token-consumption page is the only unauthenticated step. The forgot-password flow is unauthenticated end-to-end, lives in a different URL namespace, and writes to a different token table. Merging them into a shared "unauthenticated tokens" group would create a brittle grouping that conflates two unrelated concerns. The `(email-verify)` group is the pattern precedent (no layout, proxy bypass) but not a shared container.

**Impact:** Adds `src/app/(password-reset)/forgot-password/page.tsx` and `src/app/(password-reset)/reset-password/page.tsx`. The `(password-reset)` group has no `layout.tsx`. Two `PUBLIC_PATHS` entries added to `src/proxy.ts`. API route handlers under `src/app/api/auth/forgot-password/route.ts` and `src/app/api/auth/reset-password/route.ts` follow the existing pattern for auth-adjacent handlers.

---

## DECISION-005: Rendered deck PDF is committed to the repo

**Status:** Resolved
**Date:** 2026-05-16

**Decision:** `deck/slides.pdf` is checked into git and re-committed every time `deck/slides.md` changes. `deck/slides.pptx` stays gitignored.

**Rationale:** A teaching artifact needs to be downloadable from the GitHub UI by anyone — including viewers who don't have Marp installed and don't want to run a build step. PDF is the lowest-common-denominator format; PPTX is large (~7 MB), Office-specific, and easily re-rendered from the source.

**Impact:** The repo will accumulate one PDF blob per non-trivial slide edit. At ~360 KB per snapshot, this is acceptable for the first few years of the project but will need revisiting later — `git lfs` migration, periodic squash, or moving the PDF to GitHub Releases are all viable when the history gets noisy. Flag this for review at the next 30-day documentation review.

---

## DECISION-004: Track the freshest sibling project (fertilityluna) for framework versions

**Status:** Resolved
**Date:** 2026-05-16

**Decision:** When choosing major versions for Next.js, React, NextAuth, Drizzle, Tailwind, ESLint config, and TypeScript, the starter pins to whatever the most recently active sibling project (currently `~/git/fertilityluna`) is running. That means: Next.js 16.2, React 19.2, NextAuth 5.0.0-beta.31, Drizzle 0.45.2, Tailwind v4, ESLint config Next 16.2, TypeScript 5.9, otplib v13.

**Rationale:** A starter that drifts behind the freshest production project becomes a worse template than the production project itself. By policy-aligning to fertilityluna's versions, the starter benefits from the upgrade work already done there — Tailwind v4 migration, otplib v13's repackaged API, React 19.2's compiler-friendly patterns — without the starter's author having to re-litigate each bump in isolation. This also makes onboarding from fertilityluna (or any sibling) to a new fork trivial: the dependency graphs match.

**Impact:** Tailwind config moved from `tailwind.config.ts` to CSS-based config in `src/app/globals.css` (via the `@theme` block). PostCSS now uses `@tailwindcss/postcss` instead of the v3 plugin + autoprefixer stack. The starter no longer ships a JS Tailwind config file. Periodically re-check the sibling-project versions at the 30-day dependency review and bump accordingly.

---

## DECISION-003: Permissions are distinct from feature flags

**Status:** Resolved
**Date:** 2026-05-16

**Decision:** Maintain two separate concepts in the starter — *permissions* (per-user authorization) and *feature flags* (per-environment toggles) — backed by separate schema, separate runtime helpers, and separate admin surfaces. They will never be merged into a single mechanism.

- Permissions live in the `features` table, are bound to roles via `role_features`, and are checked at runtime with `hasFeature(session.user.features, FEATURES.KEY)`. The static catalog is `FEATURE_CATALOG` in `src/lib/permissions.ts`.
- Flags live in the `feature_flags` table and are checked with `isFlagEnabled(key)` in `src/lib/flags.ts`.

**Rationale:** The two concepts answer different questions. "Is this *user* allowed to do X?" requires per-user state and changes as users gain or lose roles. "Is feature X *turned on* for this environment?" requires environment-level state and is the right unit for staged rollouts, dark-launches, and kill switches. Conflating them — common in starters that ship only one — forces every fork to either re-implement the missing concept or distort one mechanism to do both jobs badly. Keeping them distinct from day one means downstream forks inherit a model that scales.

**Impact:** Every new gated feature in this starter (and in forks) asks both questions independently. Forks that don't need flags can ignore the flag table; forks that don't need granular permissions can use the single `admin.dashboard` feature as a coarse admin gate. Neither concept hides inside the other.

---

## DECISION-002: TOTP 2FA over WebAuthn for the starter's default factor

**Status:** Resolved
**Date:** 2026-05-16

**Decision:** Ship TOTP (time-based one-time passwords via RFC 6238) as the second factor in the starter, with the secret encrypted at rest under `AUTH_TOTP_ENCRYPTION_KEY`, recovery codes hashed, and a trusted-device cookie for the "remember this browser" affordance. WebAuthn is *not* included in the starter.

**Rationale:** TOTP works on every device a fork's users already own (Google Authenticator, 1Password, Authy, Bitwarden, the iCloud Keychain). It requires no platform-specific UI, no attestation logic, no FIDO server. The implementation is small enough to read top-to-bottom (`src/lib/two-factor.ts`) and the admin can reset a user's enrolment with one click when a phone is lost. WebAuthn is the better second factor in the abstract, but it adds platform-specific authenticator handling, attestation policy, and a more complicated reset path that most forks don't need on day one. Forks that need WebAuthn can add it as an additional factor alongside TOTP without rewriting the starter's auth flow.

**Impact:** New users land on `/signin/totp` after their first password (or first OAuth sign-in if the user has `twoFactorRequired = true`). The TOTP secret is generated server-side, displayed once as a QR code, and stored AES-GCM-encrypted. Recovery codes are issued in the same step. The middleware enforces the 2FA gate at the edge for any route that requires it.

---

## DECISION-001: Neon Postgres with Drizzle ORM

**Status:** Resolved
**Date:** 2026-05-16

**Decision:** Use Neon as the Postgres host and Drizzle ORM as the query layer for the starter. App connections use the pooled host (`-pooler` suffix) via `@neondatabase/serverless`; Drizzle Kit uses the direct (unpooled) host for DDL.

**Rationale:** Neon's branching is the killer feature for an SDLC-focused starter — every schema change can happen on a disposable branch, tested with the seed script, and only promoted to `main` when the shape is right. Scale-to-zero keeps the cost-of-ownership for a fresh fork at effectively zero until it has traffic. The serverless driver fits Next.js route handlers, server actions, and the Edge runtime constraints without separate connection pooling code. Drizzle ORM was chosen over Prisma for three reasons: (1) the generated query layer is a thin TypeScript wrapper rather than an out-of-process binary, which means no separate `prisma generate` step in the fork's build; (2) `schema.ts` is the source of truth and is reviewed as code, not as a separate `.prisma` DSL; (3) `db:push` makes early development on a branch fast, while `db:generate` produces reviewable SQL once the schema stabilizes.

**Impact:** The fork needs two environment variables (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`). The schema in `src/lib/db/schema.ts` covers NextAuth's adapter tables plus the starter's own surface (roles, features, role bindings, TOTP, recovery codes, trusted devices, feature flags, audit events, migration seeds). Migrations during early development run via `db:push`; once a fork is in production, `db:generate` + committed SQL becomes the right path.
