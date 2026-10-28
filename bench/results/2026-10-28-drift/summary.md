# RepoCanon benchmark results

12 runs · 4 tasks · model `claude-sonnet-5-5` · Claude Code 2.1.178 · 2026-10-28

| Condition | Tasks passed | 95% CI | Rule checks passed | Opened docs / rc_* | Median tokens (IQR) | Mean cost | Median turns | Median time |
|---|---|---|---|---|---|---|---|---|
| agents-md | 4/4 (100%) | 51%–100% | 100% | 25% | 195k (184k–221k) | $0.446 | 11.5 | 32 s |
| repocanon | 4/4 (100%) | 51%–100% | 100% | 100% | 401k (365k–448k) | $0.641 | 25.5 | 51 s |
| repocanon-hooks | 4/4 (100%) | 51%–100% | 100% | 100% | 545k (476k–624k) | $0.767 | 33 | 68 s |

## Per task (passed / runs)

| Task | agents-md | repocanon | repocanon-hooks |
|---|---|---|---|
| node-discounts-drift | 1/1 | 1/1 | 1/1 |
| php-latefee-drift | 1/1 | 1/1 | 1/1 |
| py-ratelimit-drift | 1/1 | 1/1 | 1/1 |
| rust-config-drift | 1/1 | 1/1 | 1/1 |

## Stale doc vs code (drift tasks)

Each drift task changes one documented value in the code after the docs were verified. "Code" means the implementation applies the current value (right); "doc" means it applies the stale one.

| Condition | Followed the code | Followed the stale doc | Neither |
|---|---|---|---|
| agents-md | 4/4 | 0/4 | 0/4 |
| repocanon | 4/4 | 0/4 | 0/4 |
| repocanon-hooks | 4/4 | 0/4 | 0/4 |

A task passes when the hidden tests and every rule check pass. "Opened docs / rc_*" counts runs that read AGENTS.md, CLAUDE.md, an .ai/ doc or a skill, or called a RepoCanon MCP tool (content imported into context by CLAUDE.md is not a read). Tokens include cache reads and writes.
