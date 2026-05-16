# Decisions Log

Architectural and implementation decisions for the Claude Code Starter. Newest first. Each decision is numbered; the number does not change once assigned.

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
