# Review Log

The source of truth for periodic-review history. Claude reads this at session start to check whether any review is overdue against its cadence (see `CLAUDE.md` → Periodic Reviews).

## Format

Newest first. One line per review:

```
YYYY-MM-DD | <type> | <one-line outcome>
```

Where `<type>` is one of:

- `test-coverage` (cadence: 7 days)
- `retrospective` (cadence: 7 days)
- `code` (cadence: 30 days)
- `documentation` (cadence: 30 days)
- `security` (cadence: 30 days)
- `agent-instruction` (cadence: 30 days)
- `dependencies` (cadence: 30 days)

For substantial reviews that produce significant findings, also write `docs/reviews/YYYY-MM-DD-<type>.md` with the details and link it from the log entry like:

```
2026-05-23 | security | 2 medium findings, 3 low; see 2026-05-23-security.md
```

For no-op reviews (a cycle genuinely produced no actionable findings), use:

```
2026-05-23 | retrospective | nothing material
```

If three retrospectives in a row produce nothing, the cadence itself is suspect — surface that to the user.

## Entries

<!-- newest entries go here, above the older ones -->
2026-05-18 | test-coverage | flags.ts and two-factor.ts brought to 100% coverage (6 + 28 tests); full suite 139/139 green; typecheck clean
2026-05-17 | retrospective | first run; 0 loop-backs across 6 features; top risks: test coverage debt (two-factor.ts/proxy.ts at 0%), 2 security findings survived all phases (open redirect, enrollment loop), CLAUDE.md 3 versions behind; 6 edits proposed; see 2026-05-17-retrospective.md
2026-05-17 | security | first run; 0 critical, 1 high, 4 medium, 3 low, 2 informational; top: open redirect (callbackUrl), email token plaintext, 2FA enrollment loop; see 2026-05-17-security.md
2026-05-17 | documentation | first run; 3 critical (CLAUDE.md missing v0.3 features, 2 missing commands, 3 missing route groups), 4 notable, 5 minor; see 2026-05-17-documentation.md
2026-05-17 | code | first run; 3 critical, 6 notable, 4 minor, 6 observations; top items: TOTP audit literals bypass catalog, isFlagEnabled never called, proxy /account fallthrough undocumented; see 2026-05-17-code.md
2026-05-17 | agent-instruction | first run; 0 critical, 3 notable, 5 minor, 4 observations; top items: qa.md description has stale "no test runner" caveat, api-developer description claims schema-change ownership (blurs database-admin boundary), deployment-engineer env-var table missing 6 variables; see 2026-05-17-agent-instruction.md
2026-05-17 | dependencies | first run; 0 urgent, 3 soon (@neondatabase/serverless major, typescript 6, eslint 10), 3 held (next-auth beta, drizzle-kit/esbuild CVE, next/postcss CVE); see 2026-05-17-dependencies.md
2026-05-16 | test-coverage | first run; 1 of 9 critical modules covered (permissions.ts 100%); two-factor.ts, flags.ts, proxy.ts all at 0%; 7-item punch-list; see 2026-05-16-test-coverage.md
