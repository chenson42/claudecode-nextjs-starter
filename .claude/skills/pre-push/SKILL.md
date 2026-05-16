---
name: pre-push
description: Run pre-push verification — typecheck, build, schema/migration check, release notes, and a quick housekeeping sweep — before pushing to main
---

# Pre-Push Checks

When the user invokes `/pre-push`, run every verification step required before pushing to `main`. This skill never pushes — it only reports readiness.

## Step 1: Snapshot the Current State

Run, in parallel:

- `git status`
- `git log --oneline -10`
- `git branch --show-current`

Confirm:

- What branch we're on.
- What's staged and unstaged.
- What commits will be in the push.

**If there are uncommitted changes:** STOP. Ask the user whether to commit them first or abort.

## Step 2: Sync with `main` (if on a feature branch)

```bash
git fetch origin main
git log HEAD..origin/main --oneline
```

If `main` has new commits, ask the user whether to merge before continuing. Don't merge unilaterally — branch sync is an explicit user choice.

## Step 3: Type Check

```bash
npm run typecheck
```

`tsc --noEmit` runs against the same config the build uses. If it fails:

- Show the error output.
- Identify the failing file(s) and error type.
- Offer to fix the issues.

**Do not proceed if typecheck fails.**

## Step 3b: Audit-Coverage Tripwire

```bash
npm run check:audit
```

`scripts/check-audit-coverage.mjs` walks every `actions.ts` under `src/app/`, grep-lints for `db.insert/update/delete` without a corresponding `auditEvents` row, and fails if a security-sensitive mutation is missing its audit write. Add the `auditEvents` insert, or — if the mutation is genuinely not security-relevant — annotate the line above with `// audit-exempt: <reason>`.

**Do not proceed if the audit-coverage check fails.**

## Step 3c: Unit Tests

```bash
npm test
```

Vitest runs every `*.test.ts` under `src/`. If a test fails, fix it before pushing — a broken test in the starter teaches every fork to ignore tests.

**Do not proceed if any test fails.**

## Step 4: Production Build

```bash
npm run build
```

`next build` does its own type pass and catches things `tsc --noEmit` alone won't (the Next.js plugin, route inference, etc.). If the build fails:

- Show the failing route or module.
- Offer to fix.

**Do not proceed if the build fails.**

## Step 5: Schema and Migration Check

The starter uses Drizzle Kit. `src/lib/db/schema.ts` is the source of truth.

1. Check whether `schema.ts` has changed since `main`:
   ```bash
   git diff main -- src/lib/db/schema.ts
   ```
2. If yes, check whether a corresponding generated migration is committed under `drizzle/`:
   ```bash
   git status drizzle/ | head
   git diff main -- drizzle/ | head -40
   ```
3. If the schema changed but no migration was generated, ask the user whether they intended to:
   - Use `npm run db:push` (no migration file, applied directly) — fine for early development on a Neon branch.
   - Run `npm run db:generate` to produce a committed migration — required if forks of the starter need to replay the change.

If the seed (`scripts/seed.ts`) changed, suggest running `npm run db:seed` against a fresh Neon branch to verify it still applies cleanly.

## Step 6: Release Notes and Version Bump

**Required before every push to `main`.**

1. Read `package.json` to see the current version.
2. Read the most recent `docs/release-notes/vX.Y.md` to see the latest entry.
3. Run `git log origin/main..HEAD --oneline` to list the commits being pushed.
4. Invoke `/release-notes` to write or extend the entry and bump `package.json`.
5. Commit the release-notes change so it goes out with the push.

**Documentation-only changes don't need a version bump.** Bug fixes get a PATCH bump. New features get a MINOR. Breaking changes get a MAJOR.

## Step 7: Housekeeping Sweep

Treat these as advisory warnings, not hard blockers (unless the user decides otherwise):

- **New environment variables?** Documented in `CLAUDE.md` (and `.env.example` if present)?
- **New tables or columns?** Defined in `src/lib/db/schema.ts`?
- **New routes or actions?** Auth + feature gate present on every protected entry?
- **No stray debug logs?**
  ```bash
  grep -r "console.log" src/ --include="*.ts" --include="*.tsx" | grep -v "// " | head -10
  ```
- **No native browser dialogs?**
  ```bash
  grep -rE "alert\(|confirm\(|prompt\(" src/ --include="*.ts" --include="*.tsx"
  ```
- **No env files staged?**
  ```bash
  git diff --name-only | grep -E "\.env"
  ```

## Step 8: Summary

Report results:

- Type check: PASS / FAIL
- Production build: PASS / FAIL
- Schema and migrations: in sync / pending (with details)
- Release notes + version: updated / missing
- Housekeeping warnings: list them
- **Ready to push? yes / no**
- If no: list each item that must be resolved first

**Do not push.** The user pushes manually.
