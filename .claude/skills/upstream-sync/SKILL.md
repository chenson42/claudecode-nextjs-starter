---
name: upstream-sync
description: Review upstream starter commits since your fork point and produce a classified punch-list (must-pull / should-pull / optional / skip). Runs every 14 days in a fork; the canonical starter detects itself and exits immediately.
---

# Upstream Sync

When the user invokes `/upstream-sync`, surface which commits have landed on the upstream starter's `main` branch since your last sync, classify each one, and log the result. This skill never applies commits — it produces a punch-list the fork-owner reviews before doing any `git` operation.

**This skill is fork-only.** If run inside the canonical `chenson42/claudecode` repo it detects that automatically and exits without writing anything.

---

## When to Invoke

- Any time the cadence check at session start reports `upstream-sync` is overdue (cadence: 14 days).
- Immediately after `/personalize-starter` completes on a freshly-cloned fork (first-run path).
- Any time you want a fresh look at what upstream has shipped since your last check.

---

## Pre-flight Checks

Run all three checks before doing any work. Exit cleanly on any failure — do NOT write a log entry for a failed run.

### Check 1 — Fork detection

```bash
git remote get-url origin 2>/dev/null
```

Strip a trailing `.git` from the result. Compare to the constant:

```
CANONICAL_URL = "https://github.com/chenson42/claudecode"
```

If the two match, print:

> `upstream-sync: this is the canonical starter repo — skipping (N/A).`

Stop here. Do not write a log entry. Do not write or read the state file.

### Check 2 — Tooling

```bash
command -v gh >/dev/null 2>&1
```

If `gh` is present and the user is authenticated (`gh auth status`), set `MODE=gh`.

Otherwise check for a configured upstream remote:

```bash
git remote get-url upstream 2>/dev/null
```

If an `upstream` remote exists, set `MODE=git`.

If neither is available, go to **Failure mode A**.

### Check 3 — State file

Read `.claude/upstream-state.json`.

- If the file is missing or cannot be parsed, proceed to **Step 2 (first-run path)**.
- If the file is present and valid, extract `upstreamUrl`, `forkPointSha`, `lastSyncedSha`, `lastSyncedDate`, and `personalizedPaths`. Proceed to **Step 3**.

---

## Step 1 — Fork Detection

Covered in Pre-flight Check 1. If you reach Step 1, you are confirmed in a fork.

---

## Step 2 — State File Bootstrap (First-Run Path)

Print:

> `No .claude/upstream-state.json found. Running first-time setup.`

**Determine upstreamUrl:**

- `MODE=gh`: use `CANONICAL_URL` (`https://github.com/chenson42/claudecode`). Confirm with the user before proceeding.
- `MODE=git`: run `git remote get-url upstream` to get the URL.
- Vendored fork (no remote, no gh): ask the user to supply the upstream URL manually. If they cannot, go to **Failure mode B**.

**Determine forkPointSha:**

Ask the user:

> "What commit SHA marks your fork point? Press Enter to compute automatically via `git merge-base`."

If the user presses Enter and `MODE=git`:

```bash
git fetch upstream
git merge-base HEAD upstream/main
```

Use the result as `forkPointSha`. If `MODE=gh` and the upstream remote is not configured locally, ask the user to supply the SHA. The most recent upstream SHA visible in `git log --oneline -1` of the starter at the time of forking is also acceptable — look it up with:

```bash
gh api repos/chenson42/claudecode/commits/main --jq '.sha'
```

Set:

```json
{
  "forkPointSha": "<computed or user-supplied>",
  "lastSyncedSha": "<same as forkPointSha>",
  "lastSyncedDate": "<today YYYY-MM-DD>"
}
```

Write `.claude/upstream-state.json` (full schema in the **State File Schema** section below).

Proceed to Step 3.

---

## Step 3 — Fetch Upstream Commits

Use the baseline: the `lastSyncedSha` from the state file (or `forkPointSha` if this is the first run and they are equal).

**Limit:** process at most 50 commits per run. If there are more, warn the user and process the 50 oldest (chronologically earliest) unreviewed commits first. The next run will catch the rest.

### MODE=gh

Fetch the commit list:

```bash
gh api "repos/chenson42/claudecode/commits" \
  --paginate \
  -X GET \
  -f sha=main \
  -f since=<lastSyncedDate> \
  --jq '.[] | {sha: .sha, date: .commit.author.date, author: .commit.author.name, subject: (.commit.message | split("\n")[0])}'
```

Then, for each commit SHA, fetch the file list (the `/commits` list endpoint does not include files inline):

```bash
gh api "repos/chenson42/claudecode/commits/<sha>" \
  --jq '[.files[]?.filename]'
```

This is one API call per commit. With a 50-commit cap, this is at most 51 calls — acceptable for a 14-day cadence task.

Filter out the `lastSyncedSha` itself (it was already reviewed last run). Process commits in chronological order (oldest first).

### MODE=git

```bash
git fetch upstream
git log <lastSyncedSha>..upstream/main --format="%H|%ai|%an|%s" --name-only
```

Parse the output: a line matching `[0-9a-f]{40}|...` starts a new commit entry. Non-empty lines that follow (before the next commit line) are filenames for that commit.

Fields per commit: `sha`, `date`, `author`, `subject`, `files[]`.

If `lastSyncedSha` is not found on `upstream/main`, go to **Failure mode D**.

---

## Step 4 — Classify Commits

Apply these rules in order. First match wins. If no rule matches, classify as `optional`.

| Classification | Signals |
|----------------|---------|
| `must-pull` | Subject or body contains `security`, `CVE`, `vulnerability`, `exploit`; OR subject starts with `fix:` or `bugfix:` and files touch `src/lib/auth/`, `src/proxy.ts`, `src/lib/two-factor.ts`, or `src/lib/rate-limit.ts` |
| `should-pull` | Subject starts with `fix:` or `bugfix:`, or subject mentions "defect"; files touch `src/`, `scripts/`, or `drizzle/` |
| `optional` | Subject starts with `feat:`, `feature:`, or `chore: deps`; new files added under `src/` |
| `skip` | Subject starts with `chore:` (non-deps), `docs:`, `style:`, or `ci:`; files touch only `deck/`, `.github/`, `docs/release-notes/`, or `CLAUDE.md` alone |

**Personalized-path flagging:**

For each commit, compute:

```
intersection = commit.files ∩ state.personalizedPaths
```

If the intersection is non-empty, set `conflictLikely = true` and record the intersecting paths. These will be flagged in the punch-list as `YES — <paths>` in the Conflict? column. A `conflictLikely` flag does not change the classification — it is additive.

---

## Step 5 — Build the Punch-List

Output the punch-list as a Markdown table. Show it to the user before writing the log entry.

```markdown
## Upstream Sync Punch-list — YYYY-MM-DD
Last synced through: `<lastSyncedSha short>` (YYYY-MM-DD)
Upstream: https://github.com/chenson42/claudecode

| # | SHA | Date | Subject | Classification | Conflict? | Files touched |
|---|-----|------|---------|----------------|-----------|---------------|
| 1 | `a1b2c3d` | 2026-05-06 | fix: prevent TOTP enrollment loop | **must-pull** | — | `src/app/(auth)/totp/page.tsx`, `src/lib/two-factor.ts` |
| 2 | `e4f5a6b` | 2026-05-10 | feat: rate-limit server actions | should-pull | — | `src/lib/rate-limit.ts`, `src/app/api/` |
| 3 | `c7d8e9f` | 2026-05-14 | chore: update deck slides | skip | YES — `CLAUDE.md` | `deck/slides.md`, `CLAUDE.md` |
```

**If the list is empty** (nothing new since last sync): print:

> `Nothing new since last sync (through <sha>, <date>). Log entry written.`

Then go directly to Step 6.

**SHA format:** show 7-character short SHA in the table. Full SHA goes in the state file.

**Conflict? column:** `YES — <path>, <path>` when `conflictLikely`, otherwise `—`.

---

## Step 6 — Log Results

After the punch-list is shown to the user (and they have had a chance to act on it):

**On success — append one line to `docs/reviews/log.md`:**

```
YYYY-MM-DD | upstream-sync | N commits reviewed (X must-pull, Y should-pull, Z optional, W skip)
```

Or, for an empty list:

```
YYYY-MM-DD | upstream-sync | nothing new since last sync
```

**If N > 0 — also write `docs/reviews/YYYY-MM-DD-upstream-sync.md`** with the full punch-list table.

**Update `.claude/upstream-state.json`:**

- Set `lastSyncedSha` to the newest commit SHA processed (full 40-char SHA).
- Set `lastSyncedDate` to today (`YYYY-MM-DD`).

**On any failure before completing Step 3:** write NOTHING. Print the specific failure reason from the list below and exit.

---

## Failure Modes

**Mode A — No tooling available:**

> `Cannot reach upstream. Install the GitHub CLI (gh) or run:`
> `  git remote add upstream https://github.com/chenson42/claudecode`
> `Then retry /upstream-sync.`

**Mode B — Vendored fork, user cannot supply URL:**

> `Cannot determine upstream. Provide the upstream URL and your fork-point SHA to proceed.`

**Mode C — GitHub API unreachable (network error or non-200 response):**

> `GitHub API unreachable (HTTP <status> or network error). No log entry written. Try again when the network is available.`

**Mode D — lastSyncedSha not found on upstream/main:**

> `Last-synced SHA <sha> not found on upstream/main. Upstream may have been rebased or force-pushed.`
> `Supply a new baseline SHA (e.g., the most recent upstream release tag) to reset the sync point.`

---

## State File Schema

`.claude/upstream-state.json` — committed to the fork's repo (not gitignored).

```json
{
  "upstreamUrl": "https://github.com/chenson42/claudecode",
  "forkPointSha": "<40-char SHA of the upstream commit your fork was cut from>",
  "lastSyncedSha": "<40-char SHA of the newest upstream commit reviewed>",
  "lastSyncedDate": "YYYY-MM-DD",
  "personalizedPaths": [
    "src/app/globals.css",
    "CLAUDE.md",
    "package.json",
    "src/app/page.tsx"
  ]
}
```

`personalizedPaths` is populated by `/personalize-starter` on first run (Step 8 of that skill). It lists the files that were edited during personalization — upstream commits that touch these files are flagged `conflictLikely` in the punch-list. Edit the list manually if you later personalize additional files.

The state file is written by this skill (Step 2 for first-run, Step 6 for updates). It is never written on a failed run.

---

## Output Summary

| Outcome | Log entry written | State file updated | Detail file written |
|---------|-------------------|-------------------|---------------------|
| Pre-flight: canonical repo | No | No | No |
| Pre-flight: tooling failure | No | No | No |
| First-run, success | Yes | Yes (created) | Yes (if N > 0) |
| Recurring run, commits found | Yes | Yes (updated) | Yes |
| Recurring run, nothing new | Yes | Yes (date updated) | No |
| Any failure before Step 3 | No | No | No |
