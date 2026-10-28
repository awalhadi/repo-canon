# RepoCanon benchmark

Does project knowledge help a coding agent follow a project's rules, and does RepoCanon's way of delivering that knowledge do better than a hand-written `AGENTS.md`? This folder holds everything needed to measure it again.

## Results
Latest run: [results/2026-10-27](results/2026-10-27/summary.md). This was 160 runs on `claude-sonnet-5-5`, costing $77.40.

| Condition | Pass rate |
|---|---|
| none | 8% |
| agents-md | 100% |
| repocanon-pointer | 100% |
| repocanon | 100% |

The RepoCanon conditions cost about 1.5× the hand-written AGENTS.md. Across 80 RepoCanon runs, no agent called an `rc_*` MCP tool or used the skill. The README's [Benchmark section](../README.md#benchmark) explains how to read this.

## What is measured
Claude Code runs 8 tasks in 4 small projects under 4 conditions:

| Condition | What the agent gets |
|---|---|
| `none` | the project only |
| `agents-md` | a good hand-written `AGENTS.md` (overview, commands, rules, decisions, a directory tree), imported by `CLAUDE.md` |
| `repocanon-pointer` | a RepoCanon layer (`.ai/` docs, scoped skill, MCP server) with `"entryDigest": false`: `AGENTS.md` only points to `.ai/`. This was the 0.5 design. |
| `repocanon` | the same layer as shipped in 0.6: `AGENTS.md` also carries a digest of `.ai/CONVENTIONS.md` and `.ai/DECISIONS.md` |

**Both knowledge conditions get the same facts.** `fixtures/<project>/knowledge/AGENTS.md` and `fixtures/<project>/knowledge/ai/` say the same things; only the form and delivery differ.

For every run the harness records:
- **Pass:** the hidden tests pass **and** every rule check passes.
- **Rule checks:** project rules checked in the code, e.g. no floats on money, time only through `clock`, no `unwrap()` in `src/`, the error code is in the catalogue.
- **Tokens and cost**, as reported by Claude Code (`total_cost_usd`, and input, output and cache tokens).
- **Opened docs / rc_\*:** whether the agent read `AGENTS.md`, an `.ai/` doc or a skill, or called a RepoCanon MCP tool. Content imported into context by `CLAUDE.md` doesn't count as a read.

## Tasks
Each project hides conventions that the code alone doesn't make obvious. That is the kind of knowledge RepoCanon exists for.

| Task | Project | Language | The ticket | Rules it touches |
|---|---|---|---|---|
| `node-discounts` | node-shop | JavaScript | discount codes at checkout | one error code for bad codes, rounding in the shop's favour, data access through repositories |
| `node-cancel` | node-shop | JavaScript | cancel an order | only `placed` orders, the event carries `refundCents`, error catalogue |
| `py-deactivate` | py-api | Python | deactivate users | `clock` for time, 409 `<noun>_already_<state>`, 403 for deactivated senders, logging |
| `py-ratelimit` | py-api | Python | rate-limit messages | 429 with `retry_after`, warning log, `clock` for time |
| `php-refund` | php-billing | PHP | partial refunds | credit notes, never edit issued invoices, `refund_exceeds_invoice` |
| `php-latefee` | php-billing | PHP | late fees | a separate `FEE` invoice, 2% with a 5.00 minimum, ids from `IdGenerator` |
| `rust-json` | rust-cli | Rust | `--format json` | the output is `{"count", "notes"}`, no crates, no `unwrap()` |
| `rust-config` | rust-cli | Rust | a `max_results` setting | default 20, env > file > default, `AppError::Config` naming the key |

The ticket (`tasks/<id>/task.md`) states the interface the tests call, but never the hidden rules. Graders are in `tasks/<id>/check.js`, the hidden tests in `tasks/<id>/hidden/`, and a reference solution in `tasks/<id>/solution/`.

## Running it
Requirements: Node 18+, Python 3, PHP 8, Rust (cargo), and Claude Code logged in. No packages are installed during runs.

```bash
node bench/run.js --self-test        # each grader fails the untouched project and passes the reference solution (free)
node bench/run.js --dry-run          # the whole pipeline with a fake agent (free)
node bench/run.js --runs 5 --model claude-sonnet-5-5 --max-total-usd 110
```

Options:
- `--tasks` and `--conditions` filter what runs;
- `--concurrency` sets how many runs go at once;
- `--budget-per-run` and `--max-total-usd` stop spending;
- `--keep` keeps each run's folder for inspection;
- `--out` picks the results folder.

Results are appended to `results/<date>/runs.jsonl`, so re-running the same command picks up where it stopped. Each run prints `summary.md` and `summary.json` at the end.

## How each run is isolated
- A fresh temp copy of the project, a new git repo, and the condition applied and committed. The RepoCanon conditions are built with **this checkout's** CLI: `init --targets=claude`, `analyze`, `skills`, `stamp --all`.
- The same flags for every condition:
  - `claude -p <ticket> --model <id> --max-budget-usd 1.5 --permission-mode acceptEdits`;
  - `--allowedTools "Read Edit Write Glob Grep Bash mcp__repocanon"`;
  - `--setting-sources project --no-session-persistence --strict-mcp-config`;
  - a 15-minute timeout.
- Only the RepoCanon conditions get an MCP server (`repocanon mcp --root=<run>`). `--setting-sources project` and `--strict-mcp-config` keep the runner's personal settings and MCP servers out.
- A run whose agent crashed or timed out is retried once; the cost of both attempts is counted.

## Drift suite
`node bench/run.js --suite drift` runs 4 drift tasks (`*-drift`) under `agents-md`, `repocanon` and `repocanon-hooks`, the 0.7 plugin's session, edit-time and end-of-turn hooks pointing at this checkout, with claim anchors kept.

Each drift task copies a core task and adds a policy value the docs describe correctly (`base/`). The docs are added and stamped, then a later commit changes that value (`drift/`, message in `task.json`) and the docs are left alone. The hidden tests expect the code's new value, and a probe records whether the implementation followed the **code**, the stale **doc**, or **neither**.

| Task | Value the docs state | The code after the drift |
|---|---|---|
| `php-latefee-drift` | late fee 2%, minimum 5.00 | `LateFeePolicy` 3%, 10.00 |
| `rust-config-drift` | `max_results` default 20 | `defaults::MAX_RESULTS` 50 |
| `node-discounts-drift` | discounts 1–100% | `MAX_DISCOUNT_PERCENT` 50 |
| `py-ratelimit-drift` | 429 code `rate_limited` | `error_codes.RATE_LIMITED` `too_many_requests` |

**Pilot result (12 runs, $7.42, [results/2026-10-28-drift](results/2026-10-28-drift/summary.md)):** every run in every condition followed the code. The changed value sits next to the code the agent edits, so it reads it and trusts it. This design doesn't separate the conditions, and the 5-run version was not run. A useful drift puts the changed fact where the agent wouldn't otherwise look.

**Cross-module round (27 runs, $10.75):** `node-cancel-xdrift` moves the fact into another module (restocking moves from `cancelOrder` to a warehouse listener), with `buryCommits: 12` so the drift isn't the newest commit, and a `docFixed` diagnostic (the stale sentence is gone from every knowledge file after the run). Every run followed the code. RepoCanon runs fixed the stale doc 6/6, `AGENTS.md` runs 0/3.

Path and command linters for agent docs (etymd, agentslint and others) were not run as a condition. In these tasks every path and command in the doc still exists, so they have nothing to report by construction.

## Threats to validity
- **Small and authored by us.** 8 tasks in 4 small projects, written for this benchmark. Real repositories are bigger and messier. The rules are deliberately ones the code alone doesn't reveal.
- **One agent, one model per run.** Results for other agents or models may differ.
- **The fixtures and the RepoCanon change come from the same people.** The smoke run that led to the 0.6 digest used one of these tasks (`node-discounts`). Both designs are reported, so the effect of that change is visible rather than hidden.
- **Variance.** 5 runs per cell; pass rates carry Wilson 95% intervals, which are wide at this size.
