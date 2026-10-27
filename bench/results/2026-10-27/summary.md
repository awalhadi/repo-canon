# RepoCanon benchmark results

160 runs · 8 tasks · model `claude-sonnet-5-5` · Claude Code 2.1.178 · 2026-10-27

| Condition | Tasks passed | 95% CI | Rule checks passed | Opened docs / rc_* | Median tokens (IQR) | Mean cost | Median turns | Median time |
|---|---|---|---|---|---|---|---|---|
| none | 3/40 (8%) | 3%–20% | 58% | — | 194k (151k–230k) | $0.362 | 16 | 31 s |
| agents-md | 40/40 (100%) | 91%–100% | 100% | 0% | 236k (194k–245k) | $0.377 | 14.5 | 35 s |
| repocanon-pointer | 40/40 (100%) | 91%–100% | 100% | 100% | 415k (370k–452k) | $0.622 | 29 | 55 s |
| repocanon | 40/40 (100%) | 91%–100% | 100% | 100% | 380k (294k–434k) | $0.575 | 26.5 | 55 s |

## Per task (passed / runs)

| Task | none | agents-md | repocanon-pointer | repocanon |
|---|---|---|---|---|
| node-cancel | 0/5 | 5/5 | 5/5 | 5/5 |
| node-discounts | 0/5 | 5/5 | 5/5 | 5/5 |
| php-latefee | 0/5 | 5/5 | 5/5 | 5/5 |
| php-refund | 0/5 | 5/5 | 5/5 | 5/5 |
| py-deactivate | 0/5 | 5/5 | 5/5 | 5/5 |
| py-ratelimit | 3/5 | 5/5 | 5/5 | 5/5 |
| rust-config | 0/5 | 5/5 | 5/5 | 5/5 |
| rust-json | 0/5 | 5/5 | 5/5 | 5/5 |

A task passes when the hidden tests and every rule check pass. "Opened docs / rc_*" counts runs that read AGENTS.md, CLAUDE.md, an .ai/ doc or a skill, or called a RepoCanon MCP tool (content imported into context by CLAUDE.md is not a read). Tokens include cache reads and writes.
