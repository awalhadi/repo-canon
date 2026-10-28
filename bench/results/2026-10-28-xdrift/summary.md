# RepoCanon benchmark results

9 runs · 1 tasks · model `claude-sonnet-5-5` · Claude Code 2.1.178 · 2026-10-28

| Condition | Tasks passed | 95% CI | Rule checks passed | Opened docs / rc_* | Median tokens (IQR) | Mean cost | Median turns | Median time |
|---|---|---|---|---|---|---|---|---|
| agents-md | 3/3 (100%) | 44%–100% | 100% | 67% | 241k (241k–259k) | $0.389 | 17 | 29 s |
| repocanon | 3/3 (100%) | 44%–100% | 100% | 33% | 156k (156k–228k) | $0.377 | 4 | 21 s |
| repocanon-hooks | 3/3 (100%) | 44%–100% | 100% | 100% | 244k (244k–288k) | $0.416 | 16 | 28 s |

## Per task (passed / runs)

| Task | agents-md | repocanon | repocanon-hooks |
|---|---|---|---|
| node-cancel-xdrift | 3/3 | 3/3 | 3/3 |

## Stale doc vs code (drift tasks)

Each drift task changes one documented value in the code after the docs were verified. "Code" means the implementation applies the current value (right); "doc" means it applies the stale one.

| Condition | Followed the code | Followed the stale doc | Neither |
|---|---|---|---|
| agents-md | 3/3 | 0/3 | 0/3 |
| repocanon | 3/3 | 0/3 | 0/3 |
| repocanon-hooks | 3/3 | 0/3 | 0/3 |

A task passes when the hidden tests and every rule check pass. "Opened docs / rc_*" counts runs that read AGENTS.md, CLAUDE.md, an .ai/ doc or a skill, or called a RepoCanon MCP tool (content imported into context by CLAUDE.md is not a read). Tokens include cache reads and writes.
