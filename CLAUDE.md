# CLAUDE.md

Guidance for Claude Code when working in the **Claude Code Starter**.

**Sections:** [Project Overview](#project-overview) · [What This Starter Gives You](#what-this-starter-gives-you) · [How This User Works](#how-this-user-works) · [Stack](#stack) · [Project Layout](#project-layout) · [Agent Roster](#agent-roster) · [Development Pipeline](#development-pipeline) · [Periodic Reviews](#periodic-reviews) · [Document Naming](#document-naming) · [Workflow Rules](#workflow-rules) · [Common Commands](#common-commands) · [Key Invariants](#key-invariants)

## Project Overview

The **Claude Code Starter** is a fork-and-go Next.js template for new web apps. It is also a teaching artifact for how to work with Claude Code: every file under `.claude/`, every doc in `docs/`, and the conventions in this file are meant to be read, copied, and adapted.

Fork the starter, search-and-replace the project name, tune the brand colors in the `@theme` block of `src/app/globals.css`, fill in `.env.local`, and you have a deployable app with sign-in, an admin shell, roles and permissions, TOTP 2FA, environment feature flags, an audit log, and release notes — all wired and ready to extend.

## What This Starter Gives You

Out of the box, a fork ships with:

- **Authentication** — NextAuth 5 (beta) with Google OAuth. JWT sessions carry the user's roles, features, and 2FA state.
- **TOTP 2FA** — Enrolment with QR code, verification, recovery codes, and a trusted-device cookie. Secrets are encrypted at rest with `AUTH_TOTP_ENCRYPTION_KEY`.
- **Roles and permissions** — A `roles` ↔ `features` ↔ `users` model. `FEATURES` in `src/lib/permissions.ts` is the static catalog; `hasFeature()` is the runtime check. Permissions are *separate* from feature flags.
- **Feature flags** — A `feature_flags` table with an environment-level toggle and rollout percent. `isFlagEnabled(key)` is the runtime check.
- **Admin shell** — `/admin` with subpages for users, roles, flags, docs, and 2FA management. Gated by the `admin.dashboard` feature.
- **Audit log** — Append-only `audit_events` table. Security-sensitive mutations write rows here.
- **Release notes viewer** — Admin docs page renders versioned release notes from `docs/release-notes/vX.Y.md`.
- **Route protection** — `src/proxy.ts` enforces the auth + 2FA gate at the edge (Next 16's `proxy.ts` convention, which replaces the deprecated `middleware.ts`).
- **Seed script** — `scripts/seed.ts` creates admin and member roles, seeds every feature in `FEATURE_CATALOG`, and registers a demo feature flag.

## How Claude Should Behave in This Repo

These rules apply regardless of who's forked the project or how they've configured Claude Code:

- **Re-render the deck whenever `deck/slides.md` changes.** After editing `deck/slides.md`, run `npm run deck` to refresh both outputs. `deck/slides.pdf` IS committed to the repo (so viewers can download it from GitHub without installing Marp) — re-render *and re-commit it* in the same change as the source edit. `deck/slides.pptx` stays gitignored. If the render fails, fix the cause; don't leave stale outputs behind.
- **Be deliberate with destructive commands.** A wrong `git reset --hard` or `npm run db:push -- --force` is hard to undo. State what you're about to do before non-trivial commands so the user has a chance to interrupt.
- **Wait for explicit approval before committing or pushing.** Pre-commit and pre-push are user gestures, not background tasks.
- **Never push without going through `/pre-push`.** The checklist exists so the agent doesn't ship broken builds.

## Original Author's Setup (informational)

The author of this starter (`chenson42@gmail.com`) runs Claude Code with `--dangerously-skip-permissions` and expects Claude to **run frequent commands directly** rather than asking the user — dev servers, builds, typechecks, watchers, log tails, db pushes all happen in Claude's hands. The exception is genuinely interactive commands (e.g. `gcloud auth login`), which bounce back to the user with the `! ` prefix hint.

If you've forked this starter and run Claude Code with the default permission prompts, ignore the above — your existing prompt-before-acting flow is the right behavior for you. The "Behave in This Repo" rules above are the universal ones.

## Stack

- **Next.js 16** App Router, **React 19**, **TypeScript** strict
- **Drizzle ORM** + **Neon Postgres** (serverless, with branching)
- **NextAuth 5 beta** — Google OAuth, JWT-backed sessions
- **Tailwind CSS** + shadcn-style primitives via **Radix UI**
- **otplib** + **qrcode** for TOTP 2FA
- **Resend** for transactional email (`src/lib/email.ts`)
- **react-markdown** + **remark-gfm** for the admin docs viewer
- **Vitest** for unit tests (`*.test.ts` next to source); **Playwright** + chromium for e2e tests under `e2e/`
- **Vercel** target deployment (the starter is platform-agnostic but ships Vercel-ready)

## Project Layout

```
src/
├── app/
│   ├── (auth)/signin/       — Sign-in (Google OAuth)
│   ├── (auth)/totp/         — TOTP enrolment + verification
│   ├── (admin)/admin/       — Admin shell (users, flags, docs, 2fa subpages)
│   ├── access-pending/      — Landing for authenticated users with no roles
│   ├── api/                 — Route handlers (auth callbacks, admin APIs)
│   ├── page.tsx             — Public landing page
│   └── layout.tsx           — Root layout
├── lib/
│   ├── db/                  — Drizzle connection + schema
│   ├── auth/                — NextAuth config
│   ├── permissions.ts       — FEATURES catalog + hasFeature()
│   ├── flags.ts             — isFlagEnabled()
│   └── two-factor.ts        — TOTP encrypt/decrypt + verify
├── auth.ts                  — NextAuth entry (re-exported across the app)
├── proxy.ts                 — Next 16 route gate (admin + 2FA enforcement)
└── types/                   — Ambient type declarations
scripts/
└── seed.ts                  — Roles + features + demo flag seed
docs/
├── decisions.md             — ADR-style decision log
├── work-log/                — Per-feature pipeline tracking
├── reviews/                 — Review log + detail files
└── release-notes/           — vX.Y.md files surfaced in admin docs
.claude/
├── agents/                  — Agent definitions
├── skills/                  — Slash-command skills
└── settings.json            — Permission allowlist
```

## Agent Roster

Agents live in `.claude/agents/`. Spawn the right one for the phase.

| Agent | Pipeline phase | When to invoke |
|-------|---------------|---------------|
| **analyst** | Phase 1 & 6 | Functional refinement before design; shipped-vs-intent review after QA. |
| **architect** | Phase 2 | New subdirectories, npm dependencies, structural changes. |
| **tech-lead** | Phase 3 | Before writing >50 lines; authors the design doc. |
| **database-admin** | Phase 4 (schema) | `schema.ts` changes, Drizzle Kit work, indexes. |
| **api-developer** | Phase 4 (server) | Route handlers, server actions, business logic. |
| **ux-developer** | Phase 4 (client) | React components, admin pages, forms. |
| **full-stack-developer** | Phase 4 (small/coupled) | Features small enough that splitting adds overhead. |
| **deployment-engineer** | Pre-deploy | Production build verification, env vars, build failures. |
| **qa** | Phase 5 | Test verification, typecheck, regression tests. |

**The full six-phase pipeline is defined below. Every feature flows through it. Work is not complete until analyst issues SHIP IT in Phase 6.**

When handing off between phases, preserve the prior phase's full output in the work-log. Do not summarize away the analyst's gaps or the architect's invariant rulings.

## Development Pipeline

Every change — new feature or bug fix — flows through six phases. Loop-backs are expected.

```
Phase 1            Phase 2            Phase 3
─────────          ─────────          ─────────
analyst    ──►    architect   ──►    tech-lead
Functional         Architectural      Technical
refinement         review             design
   ▲                                    │
   │                                    ▼
   │                                  Phase 4
   │                                  ─────────
   │                                  Implementer
   │                                  (db-admin |
   │                                   api-developer |
   │                                   ux-developer |
   │                                   full-stack)
   │                                    │
   │                                    ▼
Phase 6            Phase 5
─────────          ─────────
analyst    ◄──    qa
Shipped vs         Test
intent             verification
sign-off
```

A loop-back from any later phase returns to the **earliest** phase where the failure originated, not just the previous phase.

### Phase 1 — Functional Refinement (analyst)

**Trigger:** New feature request or bug report.
**Output:** Four-pass review (user verbs, flow audit, permissions/flags, gaps).
**Gate:** Verdict must be `READY FOR DESIGN` or `READY WITH NOTES`.
**Loop-back:** `NEEDS REWORK` or `NOT YET` returns to the user. Pipeline pauses.

### Phase 2 — Architectural Review (architect)

**Trigger:** Phase 1 advanced.
**Output:** Verdict on directory placement, server/client split, dependency requirements, invariant compliance.
**Gate:** `Approved` or `Approved with suggestions`.
**Loop-back:** `Needs revision` returns to Phase 1 if the feature shape is wrong; otherwise the architect documents the resolution and advances.

### Phase 3 — Technical Design (tech-lead)

**Trigger:** Architect approved Phase 2.
**Output:** Design doc covering permissions/flags, API contract, data model, component plan, implementation order, edge cases.
**Gate:** Design complete and the implementer is named.
**Loop-back:** Architectural concern returns to Phase 2. Functional inconsistency returns to Phase 1.

### Phase 4 — Implementation

**Trigger:** Tech-lead's design is complete.
**Implementer selection:**

| Scope | Implementer |
|-------|-------------|
| Schema only | **database-admin** |
| Route handlers, server actions, server logic | **api-developer** |
| React components, pages, forms | **ux-developer** |
| Spans server + client and is small | **full-stack-developer** |

**Gate:** Typecheck passes. The build passes. No native browser dialogs. No `console.log` left in production paths. All invariants honored. Audit events written for security-sensitive mutations.
**Loop-back:** Design unbuildable returns to Phase 3. Architectural problem discovered returns to Phase 2.

### Phase 5 — Test Verification (qa)

**Trigger:** Implementer reports Phase 4 complete.
**Output:** Build Verification Report in the work-log.
**Gate:** Verdict must be `PASS`.
**Loop-back:** `FAIL` returns to the implementer (Phase 4) with failing tests cited `file:line`. If a failure reveals a design flaw, escalate to Phase 3.

### Phase 6 — Shipped vs Intent (analyst)

**Trigger:** QA's PASS.
**Output:** Final verdict comparing the shipped feature to the Phase 1 description.
**Gate:** Verdict must be `SHIP IT`. **No other verdict closes the pipeline.**
**Loop-back:** `SHIP WITH NOTES` ships, but each note becomes a tracked follow-up. `NEEDS REWORK` returns to Phase 3 or 4 depending on the issue.

### Bug-Fix Variant

| Phase | Bug-fix behavior |
|-------|-----------------|
| 1 (analyst) | Brief — confirms the bug is real and that the fix preserves intended behavior. |
| 2 (architect) | Skip if the fix doesn't touch invariants; document the skip in the work-log. |
| 3 (tech-lead) | Brief design or skip if the fix is trivial; document the root cause regardless. |
| 4 (implementer) | Writes the fix and a failing-then-passing regression test. |
| 5 (qa) | Verifies the regression test fails before the fix and passes after. |
| 6 (analyst) | Confirms the bug no longer manifests for the user. |

**Skipping a phase requires explicit notation in the work-log. No silent skips.**

### Per-Feature Tracking

Every piece of work gets a work-log file at `docs/work-log/YYYY-MM-DD-<slug>.md` (use the date the work started) from `docs/work-log/_template.md`. The work-log is the source of truth for pipeline state — Claude reads it at session start to determine where the work stands and which agent to invoke next.

## Periodic Reviews

Seven reviews run on rolling cadences to keep the codebase, docs, security posture, test coverage, instruction layer, dependency footprint, and the development process itself from drifting.

| Review | Cadence | Owner | Why it exists |
|--------|---------|-------|---------------|
| **Test coverage** | 7 d | qa | Coverage drifts faster than any other axis on a fast-moving project; a weekly sweep catches gaps while the context for the missing tests is still recent. |
| **Retrospective** | 7 d | all agents → tech-lead synthesizes | Pipeline efficacy needs short feedback loops — a weekly retrospective produces concrete edits to agents and to this file before bad patterns calcify. |
| **Code** | 30 d | architect | Complexity hotspots, dead code, and quiet violations of invariants accumulate over weeks; a monthly pass keeps the codebase shaped like the starter is meant to be shaped. |
| **Documentation** | 30 d | tech-lead | Docs drift silently — a monthly audit catches stale environment-variable lists, broken cross-links, and CLAUDE.md sections that no longer match reality. |
| **Security** | 30 d | api-developer + database-admin | A monthly sweep of auth boundaries, secret handling, dependency CVEs, and OWASP surface area catches the slow drift between active security incidents. |
| **Agent & instruction** | 30 d | tech-lead | Agents and `.claude/` settings accumulate stale guidance, unused tools, and references to features that no longer exist; a monthly review keeps the instruction layer honest. |
| **Dependencies** | 30 d | deployment-engineer | A monthly review of `npm outdated` and `npm audit` keeps the dependency graph current without inviting weekly churn. |

Ownership claims for each review are reflected in the relevant agent file under `.claude/agents/` — read the named owner's agent file for the specifics of what each review covers and where its detail file lands.

### Cadence Check at Session Start

`docs/reviews/log.md` is the source of truth for review history. Before starting any non-trivial work, read it and check the most recent date for each review type against its cadence. If any review exceeds its cadence — or has never been run — surface this:

> "Three reviews are due before we start:
> - Test coverage: 12 days (last YYYY-MM-DD)
> - Code: never run
> - Documentation: 35 days
>
> Want me to run all three, run one (which?), or proceed and defer?"

If the user says proceed, do not append a fake log entry — the next session will surface the gap again.

**Trivial work skips the cadence check:** typo fixes, single-line config edits, answering codebase questions, running existing test suites.

### Logging Outcomes

After a review, append one line to `docs/reviews/log.md`:

```
YYYY-MM-DD | <type> | <one-line outcome>
```

For substantial reviews, also write `docs/reviews/YYYY-MM-DD-<type>.md` with details and link it from the log entry.

## Document Naming

| Document type | Filename pattern | Example |
|---------------|------------------|---------|
| Work-log entry | `docs/work-log/YYYY-MM-DD-<slug>.md` | `docs/work-log/2026-05-16-api-keys.md` |
| Review detail | `docs/reviews/YYYY-MM-DD-<type>.md` | `docs/reviews/2026-05-16-security.md` |
| Release notes | `docs/release-notes/vX.Y.md` | `docs/release-notes/v0.2.md` |
| Decision log | `docs/decisions.md` (single file, append at top) | `DECISION-007: ...` |

Slugs are short, lowercase, hyphenated, and stable. Don't rename them after the work-log is created.

## Workflow Rules

1. **Do not auto commit or push.** Wait for explicit user approval. The skip-permissions flag is not permission to skip the user's review of the diff.
2. **No native browser dialogs.** `alert()`, `confirm()`, `prompt()` are forbidden anywhere in the app. Use shadcn `Dialog` (and `AlertDialog` for destructive confirms).
3. **No secrets in committed files.** `.env.local` is gitignored; never read from `.env` files into committed code.
4. **Document decisions.** Architectural or implementation decisions go to `docs/decisions.md` (newest first, numbered).
5. **Use `/pre-push` before every push to `main`.** Typecheck, build, schema check, release notes. The skill never pushes — it only reports readiness.
6. **Permissions and flags stay separate.** Per-user permission → `FEATURES` + `hasFeature()`. Per-environment toggle → `feature_flags` + `isFlagEnabled()`. A feature usually needs both.
7. **Audit security-sensitive mutations.** Role changes, flag toggles, TOTP enrolment/reset, deactivations write to `audit_events`.

## Common Commands

```bash
npm run dev          # Start the Next.js dev server
npm run build        # Production build
npm run start        # Run the production build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run test         # Vitest unit tests (run once)
npm run test:watch   # Vitest in watch mode
npm run test:e2e     # Playwright end-to-end tests (needs the dev server running)
npm run db:push      # Sync Drizzle schema to the live database (lossy — dev only)
npm run db:generate  # Generate a versioned SQL migration in drizzle/ (use this once you have data you care about)
npm run db:seed      # Seed roles, features, and the demo flag
npm run deck         # Render deck/slides.md → slides.pptx + slides.pdf
npm run deck:pptx    # PowerPoint only
npm run deck:pdf     # PDF only
npm run deck:html    # Live-reload HTML preview
```

Generate an `AUTH_SECRET` with:

```bash
openssl rand -base64 32
```

## Key Invariants

### Server / Client Boundary

Next.js Server Components are the default. Add `'use client'` only when you need event handlers, hooks, refs, or browser APIs.

```typescript
// CORRECT — Server Component (default)
export default async function Page() {
  const session = await auth();
  return <main>{session?.user?.email}</main>;
}

// CORRECT — Client Component (interactivity)
"use client";
export function Toggle({ value }: { value: boolean }) {
  const [v, setV] = useState(value);
  return <button onClick={() => setV(!v)}>...</button>;
}
```

### Server Actions

Mark with `'use server'` at the top of the file or function. They run on the server; never trust their inputs without validation; always re-check session and permissions inside the action body.

### The Middleware Cannot Import `@/lib/db`

`src/proxy.ts` runs on the Edge runtime. It cannot import node-only modules. Keep DB access in route handlers and server actions; let the proxy check JWT claims only.

### Schema Is the Source of Truth

`src/lib/db/schema.ts` is canonical. Anything in the live database that isn't in `schema.ts` will be dropped on the next `npm run db:push`. Add a new table to `schema.ts` *first*, then push or generate the migration.

### Permissions vs Flags

| Concept | Mechanism | Question it answers |
|---------|-----------|---------------------|
| Permission | `FEATURES` + `hasFeature()` | "Is this *user* allowed to do X?" |
| Flag | `feature_flags` + `isFlagEnabled()` | "Is feature X *turned on* for this environment?" |

They are not interchangeable. A new admin action almost always needs a new permission. A new in-progress feature usually needs a flag.

### TOTP Encryption Key

The `AUTH_TOTP_ENCRYPTION_KEY` is a 32-byte secret used to AES-GCM-encrypt the user's TOTP seed at rest. **Rotating this key invalidates every enrolled TOTP secret in the database.** Do not rotate it casually.

### No Secrets in Committed Files

`.env.local`, OAuth keys, the AUTH_SECRET, the TOTP key — none of these belong in git. `.gitignore` already excludes `.env*` except `.env.example`. Don't work around it.
