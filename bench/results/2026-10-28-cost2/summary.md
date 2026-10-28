# RepoCanon benchmark results

12 runs · 12 tasks · model `claude-sonnet-5-5` · Claude Code 2.1.178 · 2026-10-28

| Condition | Tasks passed | 95% CI | Rule checks passed | Opened docs / rc_* | Median tokens (IQR) | Mean cost | Median turns | Median time |
|---|---|---|---|---|---|---|---|---|
| repocanon-hooks | 12/12 (100%) | 76%–100% | 100% | 92% | 342k (296k–434k) | $0.561 | 23 | 38 s |

## Per task (passed / runs)

| Task | repocanon-hooks |
|---|---|
| node-cancel | 1/1 |
| node-discounts | 1/1 |
| node-discounts-drift | 1/1 |
| php-latefee | 1/1 |
| php-latefee-drift | 1/1 |
| php-refund | 1/1 |
| py-deactivate | 1/1 |
| py-ratelimit | 1/1 |
| py-ratelimit-drift | 1/1 |
| rust-config | 1/1 |
| rust-config-drift | 1/1 |
| rust-json | 1/1 |

## Stale doc vs code (drift tasks)

Each drift task changes one documented value in the code after the docs were verified. "Code" means the implementation applies the current value (right); "doc" means it applies the stale one.

| Condition | Followed the code | Followed the stale doc | Neither |
|---|---|---|---|
| repocanon-hooks | 4/4 | 0/4 | 0/4 |

A task passes when the hidden tests and every rule check pass. "Opened docs / rc_*" counts runs that read AGENTS.md, CLAUDE.md, an .ai/ doc or a skill, or called a RepoCanon MCP tool (content imported into context by CLAUDE.md is not a read). Tokens include cache reads and writes.
