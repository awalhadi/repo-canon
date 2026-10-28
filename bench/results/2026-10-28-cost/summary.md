# RepoCanon benchmark results

32 runs · 8 tasks · model `claude-sonnet-5-5` · Claude Code 2.1.178 · 2026-10-28

| Condition | Tasks passed | 95% CI | Rule checks passed | Opened docs / rc_* | Median tokens (IQR) | Mean cost | Median turns | Median time |
|---|---|---|---|---|---|---|---|---|
| agents-md | 16/16 (100%) | 81%–100% | 100% | 0% | 199k (194k–237k) | $0.388 | 15 | 27 s |
| repocanon-hooks | 16/16 (100%) | 81%–100% | 100% | 94% | 300k (275k–348k) | $0.534 | 18.5 | 31 s |

## Per task (passed / runs)

| Task | agents-md | repocanon-hooks |
|---|---|---|
| node-cancel | 2/2 | 2/2 |
| node-discounts | 2/2 | 2/2 |
| php-latefee | 2/2 | 2/2 |
| php-refund | 2/2 | 2/2 |
| py-deactivate | 2/2 | 2/2 |
| py-ratelimit | 2/2 | 2/2 |
| rust-config | 2/2 | 2/2 |
| rust-json | 2/2 | 2/2 |

A task passes when the hidden tests and every rule check pass. "Opened docs / rc_*" counts runs that read AGENTS.md, CLAUDE.md, an .ai/ doc or a skill, or called a RepoCanon MCP tool (content imported into context by CLAUDE.md is not a read). Tokens include cache reads and writes.
