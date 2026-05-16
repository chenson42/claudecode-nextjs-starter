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
2026-05-16 | test-coverage | first run; 1 of 9 critical modules covered (permissions.ts 100%); two-factor.ts, flags.ts, proxy.ts all at 0%; 7-item punch-list; see 2026-05-16-test-coverage.md
