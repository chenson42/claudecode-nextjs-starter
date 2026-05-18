# Decisions Log

Architectural and implementation decisions for the Claude Code Starter. Newest first. Each decision is numbered; the number does not change once assigned.

---

## DECISION-010: Commit-message standard — hook delivery, script placement, grandfather cutoff, MTTR scope

**Status:** Resolved
**Date:** 2026-05-18

Four sub-decisions bundled because they are interdependent:

1. **Hook delivery:** `scripts/install-hooks.sh` invoked via the `prepare` npm lifecycle script — no new dependency. The starter's strong preference against unnecessary packages rules out `husky` when a 10-line shell script achieves the same result. `prepare` runs on `npm install`, giving forks automatic installation on clone. The shell script is committed to `scripts/` and symlinks (or copies) the hook into `.git/hooks/commit-msg`.

2. **Hook validator placement:** `scripts/commit-msg.mjs` — a Node ESM script matching the `check-audit-coverage.mjs` precedent already in `scripts/`. This allows the validator and `stats:escape` to share a common message-parsing helper in the same file or a co-located `scripts/commit-msg-parse.mjs`. Inline shell validation is rejected: regex in bash is brittle and the error-message requirements (name the specific missing field) are easier to satisfy in Node.

3. **`stats:escape` output:** stdout only. `scripts/stats-escape.mjs` prints to stdout; the tech-lead pipes it into the work-log manually. A file output (`docs/reviews/stats-escape-latest.md`) would need cleanup logic, a gitignore entry, or a commit every retrospective. Stdout is simpler and consistent with `check-audit-coverage.mjs`.

4. **Grandfather cutoff:** the date the feature ships (2026-05-18). No grace period. The cutoff is printed in the output header on every `stats:escape` run so the first retrospective number is honest. **MTTR deferred** to a follow-up work-log. No `Fixes-Bug:` trailer in this iteration; the escape-rate breakdown is the deliverable.

**Impact:** Adds `scripts/commit-msg.mjs`, `scripts/install-hooks.sh`, `scripts/stats-escape.mjs`. Adds `prepare` entry to `package.json`. Adds "Commit Message Standards" section to `CLAUDE.md`. Adds a cross-link to `.claude/agents/tech-lead.md`. Updates per-phase status in work-log.

---

## DECISION-009: Upstream-sync canonical URL — hardcoded in skill, not read from package.json

**Status:** Resolved
**Date:** 2026-05-18

**Decision:** The canonical starter URL (`https://github.com/chenson42/claudecode`) is hardcoded as a constant inside `.claude/skills/upstream-sync/SKILL.md`. It is NOT read from `package.json`.

**Rationale:** `package.json` in this project has no `repository` field (confirmed by grep). Requiring forks to populate `package.json` to make fork-detection work would be a silent failure mode — most forks won't know to add it. The hardcoded URL is inspectable inside the skill file itself, and a fork that deliberately wants to change the upstream target would edit the skill anyway. The alternative (reading from some config field) adds a new convention that nothing else in the project uses.

**Tradeoff:** If the canonical repo ever moves (org rename, repo rename), every fork's skill file would need to be updated. This is acceptable because repo moves are rare and the skill is the one file you'd update anyway.

**Impact:** Phase 4 sets `CANONICAL_URL = "https://github.com/chenson42/claudecode"` in the skill's pre-flight section. Trailing `.git` is stripped from `git remote get-url origin` output before comparison.

---

## DECISION-008: Upstream-sync review — skill placement, state file, cadence, and agent owner

**Status:** Resolved
**Date:** 2026-05-18

**Decision:** Four sub-decisions bundled here because they are all inter-dependent:

1. **Skill body:** `.claude/skills/upstream-sync/SKILL.md` — matches the single-file-per-skill convention already established by every other skill in `.claude/skills/`.

2. **State file:** `.claude/upstream-state.json` — flat, machine-readable, committed to the fork's repo (not gitignored). Shape (sketch): `{ "upstreamUrl": "...", "forkPointSha": "...", "lastSyncedSha": "...", "lastSyncedDate": "..." }`. This is simpler than parsing prose from `docs/reviews/log.md` and survives log re-formatting. No `.claude/state/` subdirectory created — a single file is sufficient and the "state directory for future files" risk is over-engineering.

3. **Cadence:** **14 days.** The two existing 7-day reviews are high-frequency by design (test coverage, retrospective). The five 30-day reviews are for slower-moving surfaces. Security patches from upstream can sit 30 days in a fork without notice; 14 days halves that exposure without adding session-start noise. `upstream-sync` is added to `docs/reviews/log.md` as `upstream-sync` (cadence: 14 days).

4. **Agent owner:** **tech-lead.** Already owns the retrospective (7-day) and documentation review (30-day). The upstream-sync review is instruction-layer work — reading release notes and commit classifications — which is directly analogous to the documentation review. A new section is appended to `tech-lead.md` under `## Ownership`. No new agent.

**Rationale summary:** Smallest footprint, consistent with existing conventions, 14-day cadence chosen for security-fix latency rather than convenience.

**Impact:** Adds `.claude/skills/upstream-sync/SKILL.md` (in Phase 4). Adds `.claude/upstream-state.json` (created by the skill on first run). Edits `docs/reviews/log.md` header bullet list (add `upstream-sync`). Edits `CLAUDE.md` `## Periodic Reviews` table (add 8th row) and changes "Seven reviews" to "Eight reviews". Edits `.claude/agents/tech-lead.md` `## Ownership` section (add upstream-sync paragraph).

---

## DECISION-007: `<FormattedDate>` lives in `src/components/shared/`, not `src/components/ui/`

**Status:** Resolved
**Date:** 2026-05-18

**Decision:** The timezone-safe date primitive is placed at `src/components/shared/formatted-date.tsx`, not inside `src/components/ui/`. The ESLint guard banning `toLocale*` outside that file uses a `no-restricted-syntax` pattern in `eslint.config.mjs` with a targeted `files` override that exempts the primitive's own path. The SSR fallback rendered inside `<time dateTime={iso}>` is the date portion of the ISO string (`YYYY-MM-DD`), marked `suppressHydrationWarning`.

**Rationale:**

1. **Placement.** `src/components/ui/` is reserved for generated shadcn/Radix primitives — the project instructions say "auto-generated; don't hand-edit." `<FormattedDate>` is hand-authored, cross-cutting (used by both `(admin)` and `(account)` surfaces), and requires `'use client'`. It belongs in `src/components/shared/`, which CLAUDE.md defines as "cross-cutting components used by both surfaces." No new top-level directory is needed.

2. **ESLint rule.** A `no-restricted-syntax` pattern in the existing `eslint.config.mjs` requires zero new dependencies and no plugin infrastructure. The pattern targets the `MemberExpression` where the property name matches `toLocaleString|toLocaleDateString|toLocaleTimeString`. A `files` override block in the same flat config exempts `src/components/shared/formatted-date.tsx`. This is the simplest mechanism consistent with the project's strong preference against new dependencies and custom infrastructure.

3. **SSR fallback.** The ISO-8601 string from the database (e.g., `2026-05-18T14:32:00.000Z`) is available server-side. Rendering the date portion (`YYYY-MM-DD`, extracted with `.toISOString().slice(0, 10)` — not a locale call) inside `<time>` gives the SSR output a stable, unambiguous placeholder that is close in character length to most formatted results. On hydration the client replaces it with the viewer's local format. `suppressHydrationWarning` is set on the `<time>` element to prevent the React warning caused by the intentional mismatch. Rendering nothing (empty string) would cause a jarring layout shift; rendering the full ISO timestamp would be confusing to end users if JS were slow.

**Impact:** Adds `src/components/shared/formatted-date.tsx`. Adds one `no-restricted-syntax` config block plus one `files` override to `eslint.config.mjs`. No new npm packages. All five call sites in `(admin)` and `(account)` switch from direct `toLocale*` calls to `<FormattedDate>`. A new Key Invariant is added to `CLAUDE.md` and a one-liner is added to `.claude/agents/ux-developer.md`.

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
