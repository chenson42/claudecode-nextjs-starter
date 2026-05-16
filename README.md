# Claude Code Starter

A fork-and-go Next.js template with the patterns I reach for on every project — login, an admin shell, roles + permissions, TOTP 2FA, feature flags, audit logging, transactional email, and a release-notes viewer. It also doubles as a teaching artifact for [Claude Code](https://claude.ai/code) workflows.

**Stack:** Next.js 16 · Drizzle ORM · Neon Postgres · NextAuth 5 (Google) · Resend · Vercel · Tailwind

**Deck:** [`deck/slides.pdf`](deck/slides.pdf) — a slide walkthrough of the stack and workflow, written for mixed audiences.

**Workflow:** [`CLAUDE.md`](CLAUDE.md) — the 6-phase pipeline, review cadence, agents, skills, and invariants Claude follows when working in this repo.

## Quick start

```bash
# 1. Clone + install
gh repo clone chenson42/claudecode my-app
cd my-app
npm install

# 2. Copy env template + fill in values (see below)
cp .env.example .env.local

# 3. Push schema to your Neon database
npm run db:push

# 4. Seed roles, features, and the demo feature flag
npm run db:seed

# 5. Run
npm run dev
```

Sign in with Google. Any email listed in `INITIAL_ADMIN_EMAILS` (comma-separated list) receives the `admin` role automatically on first sign-in. Enroll in 2FA at `/admin/2fa`, then everything in `/admin` is yours.

For local testing without setting up Google OAuth, set `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD` in `.env.local` and run `npm run db:seed` — that provisions a credentials-login admin with 2FA disabled.

## Environment variables

Copy `.env.example` → `.env.local` and fill these in:

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Neon Postgres connection string (pooled) |
| `AUTH_SECRET` | NextAuth session signing key — `openssl rand -base64 32` |
| `AUTH_URL` | Public origin, e.g. `http://localhost:3000` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth credentials |
| `AUTH_TOTP_ENCRYPTION_KEY` | 32-byte base64 key for encrypting 2FA secrets — `openssl rand -base64 32`. **Rotating it invalidates every enrolled secret.** |
| `INITIAL_ADMIN_EMAILS` | Comma-separated list of emails that auto-receive the `admin` role on first sign-in |
| `RESEND_API_KEY` | Resend API key (optional in dev — emails are logged instead) |
| `RESEND_FROM_EMAIL` | `Name <noreply@yourdomain.com>` |

Never commit `.env.local`. `.gitignore` enforces this.

## What's in the box

- `/signin` — Google OAuth via NextAuth 5
- `/admin` — gated by feature `admin.dashboard` + TOTP 2FA
  - `/admin/users` — assign and remove roles, with audit log
  - `/admin/flags` — toggle environment feature flags
  - `/admin/docs` — render `docs/release-notes/vX.Y.md` from the repo
  - `/admin/2fa` — TOTP enrollment with QR code
- `src/lib/permissions.ts` — `FEATURES` catalog + `hasFeature()`
- `src/lib/flags.ts` — `isFlagEnabled(key)`
- `src/lib/two-factor.ts` — TOTP encrypt/decrypt + verify
- `src/lib/email.ts` — Resend helper
- `src/proxy.ts` — auth + 2FA route gate (Next 16 `proxy.ts` convention; replaces the deprecated `middleware.ts`)
- `scripts/seed.ts` — seeds roles, features, and a demo flag
- `.claude/` — 9 agents, 5 skills, settings
- `docs/` — decisions log, work-log template, review cadence log, versioned release notes
- `deck/` — Marp training deck (`npm run deck` to render)

## Common commands

```bash
npm run dev          # Next.js dev server
npm run build        # Production build
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run db:push      # Sync Drizzle schema → DB (lossy; dev only)
npm run db:generate  # Generate a SQL migration (use once you have real data)
npm run db:seed      # Seed roles + features + demo flag
npm run deck         # Render the training deck → slides.pptx + slides.pdf
```

## Forking notes

- The `.claude/agents/`, `.claude/skills/`, and `CLAUDE.md` describe my own workflow opinions. Rewrite them as you go — they're meant to be replaced, not preserved verbatim.
- The 6-phase pipeline in `CLAUDE.md` is heavy. Trim it to whatever you actually use.
- The author runs Claude Code with `--dangerously-skip-permissions` — if you don't, ignore the "Original Author's Setup" section of `CLAUDE.md`. Everything in "How Claude Should Behave in This Repo" still applies.

## License

MIT. Take what's useful, ignore the rest.
