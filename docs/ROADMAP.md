# RepoCanon — Roadmap Tracker

Positioning: **the verified canon for AI coding agents** — only what code can't say (rules, decisions, boundaries, gotchas), loaded exactly where the agent works, proven fresh against git, enforced in CI. Local, zero-dependency, every agent.

How to use: tick `[x]` when an item is merged with tests green; mark in-progress items `[~]`. A phase is complete only when its **gate** is met. Update the progress table when you tick items.

Full strategy and market analysis: [STRATEGY.md](STRATEGY.md) (local copy) · [shared doc](https://claude.ai/artifact/DsEYKvfTDf13nXRDy8hLn7) (live, commentable)

## Progress
| Phase | Done | Total | Gate met |
|---|---|---|---|
| 0 · Trust & identity | 4 | 4 | yes — 30/30 tests green |
| 1 · v0.5 Lean, scoped, distributed | 7 | 7 | yes — 5.0 s from a cold npx cache to a working `rc_context` (2026-10-27) |
| 2 · v0.6 Proof & teams | 5 | 5 | yes — benchmark published (160 runs, 2026-10-27) |
| 3 · v0.7 Moat | 0 | 4 | no |
| 4 · v1.0+ Platform | 0 | 4 | no |
| **Total** | **16** | **24** | |

## Phase 0 — Trust & identity (week 1)
- [x] **P0.1** Remove ContextForge (`bin/contextforge.js`, `templates/contextforge.json`, `cf_*` aliases, legacy block markers, JSDoc headers); claim `repocanon` on npm, MCP registry, Open VSX. *(npm `repocanon@0.5.0` published 2026-10-27. 0.5.1 prepared and tagged locally 2026-10-27 (MCP Registry listing ships with it once published); Open VSX comes with P4.1.)*
- [x] **P0.2** Fix `stamp` (`src/services/status.service.js`): exact slug match, bare `stamp` requires `--all`, refuse when `code_paths` have uncommitted changes.
- [x] **P0.3** Fix `pack` (`src/services/pack.service.js`): ranked matching, stopwords, core rules first, truncation consistent with `estimateTokens`.
- [x] **P0.4** CLAUDE.md pointer becomes `@AGENTS.md`; doctor entry-budget target ~1k tokens (was 6000); fix stale `bytes/4` label.

**Gate:** `npm test` green, including new stamp/pack tests. ✅ Met on branch `phase-0-trust` (30/30).

## Phase 1 — v0.5 Lean, scoped, distributed (~4 weeks)
- [x] **P1.1** Inferable-content lint in `doctor`; rewrite the `prompt fill` brief to ask only for what code can't show. *(Branch `feat/inferable-lint`; ships in 0.5.1.)*
- [x] **P1.2** Path-scoped writers: nested AGENTS.md, `.cursor/rules/<module>.mdc` with `globs`, Copilot `*.instructions.md` with `applyTo`; doctor drift check source vs output. *(`repocanon rules`, branch `feat/scoped-rules`; nested AGENTS.md opt-in via `nestedAgents`.)*
- [x] **P1.3** `repocanon adopt`: import `.cursorrules`, `.cursor/rules`, CLAUDE.md, Cline memory bank; strip inferable content and report the saving. *(Branch `feat/adopt`; also drops secrets, `--move` retires originals.)*
- [x] **P1.4** Secret/PII scanner (regex + entropy, zero-dep) in doctor, hook and MCP writes. *(doctor + `secrets` command + blocking hook done on `feat/secrets-freshness`; MCP-write scanning done with P2.3.)*
- [x] **P1.5** Claude Code plugin (MCP + SKILL.md + `SessionStart`/`Stop` hooks) and `repocanon setup <ide>`. *(Branch `feat/setup-plugin`; plugin installs once 0.5.1 is on npm.)*
- [x] **P1.6** Freshness labels on every `rc_context` section ("stale: N files changed, trust the code"). *(Branch `feat/secrets-freshness`.)*
- [x] **P1.7** Interactive tool picker in `init` (Claude Code, Cursor, Copilot, Gemini/Antigravity, Windsurf, Cline, Codex/ChatGPT); choice saved as `targets` in `.repocanon.json`; re-runs show `set up` / `detected` and say `Up to date`; deselected tools removed only with consent (`--prune` in scripts); `doctor` checks only chosen tools. *(Branch `feat/init-targets`.)*

**Gate:** install-to-first-value under 60 seconds on a fresh repo. ✅ Met: 5.0 s with `npx repocanon@0.5.1` on 2026-10-27 (init 2.0 s, setup + doctor 1.9 s, first `rc_context` 1.1 s).

## Phase 2 — v0.6 Proof & teams (1–2 months)
- [x] **P2.1** Benchmark harness: no context vs hand-written AGENTS.md vs RepoCanon, ≥5 runs each, correctness + tokens, multiple languages. *(Branch `feat/bench`: 8 tasks in JS, Python, PHP and Rust; 160 runs on `claude-sonnet-5-5`, $77.40. Pass rate: none 8%, AGENTS.md 100%, RepoCanon 100% at about 1.5× cost. Led to the AGENTS.md rules digest. Ships in 0.6.0.)*
- [x] **P2.2** Meaningful-change drift, Freshness Score, `doctor --ci --strict` with `::error` annotations, GitHub Action PR comment. *(Branch `feat/drift-ci`; ships in 0.6.0.)*
- [x] **P2.3** MCP write tools with validation: `rc_propose_adr`, `rc_checkpoint_state` (no auto-stamp), `rc_stamp` with `verified_by`, `rc_verify`. *(Branch `feat/mcp-write`; agent stamps count as fresh but are labelled `verified_by: agent`; ships in 0.6.0.)*
- [x] **P2.4** SKILL.md generator from repo evidence (scripts, Makefile, CI) into `.ai/skills/`, written out per tool. *(Branch `feat/skills`: `rc-verify-change` from scripts, Makefile, justfile, Taskfile and CI; copied to `.claude/skills/` and `.agents/skills/`; ships in 0.6.0.)*
- [x] **P2.5** Monorepo support (pnpm, nx, turbo, go.work, Cargo workspaces) and deep presets (Next.js App Router, Laravel, NestJS, FastAPI, Go). *(Branch `feat/monorepo`: packages whole, apps split by feature; App Router, flat Laravel/FastAPI, layered Go; ships in 0.6.0.)*

**Gate:** benchmark results published in README with a rerunnable method. ✅ Met 2026-10-27: [README › Benchmark](../README.md#benchmark), method and raw data in [bench/](../bench/README.md).

**Release:** all of Phase 2 ships as **0.6.0** (versions set 2026-10-27; npm, MCP Registry and the `v0.6` action tag are published by the maintainer).

**What the benchmark found, as input for Phase 3:**
- RepoCanon's extra cost comes from agents reading 6+ `.ai/` docs and following the Definition of Done on every task. Make the entry cheaper: a lighter Definition of Done, and don't send agents to template-only docs.
- Claude Code headless never called the MCP tools or the skill. Make them worth calling, or don't rely on them for core value.
- Both knowledge formats scored 100%, so this task set can't tell them apart. The next round should test drift (docs that went stale), large repos, and several tools.

## Phase 3 — v0.7 Moat (3–6 months)
- [ ] **P3.1** Anchored invariants, checked claims (paths, symbols, commands, env keys), `rc_impact` tool.
- [ ] **P3.2** Boundary rules: zero-dep import checker + generated dependency-cruiser / eslint-boundaries configs.
- [ ] **P3.3** `context --for-diff` with modules one import away; optional tree-sitter plugin.
- [ ] **P3.4** Gotcha mining from git history (reverts, fix commits, hotspots); STATE handoff packet.

**Gate:** a boundary violation fails CI with a fix message the agent can act on.

## Phase 4 — v1.0+ Platform
- [ ] **P4.1** VS Code / Open VSX extension (freshness indicator, CodeLens); Canon Score badge.
- [ ] **P4.2** Parallel-agent coordination (claims and locks in STATE.md).
- [ ] **P4.3** Optional `--ai` headless fill (`claude-sonnet-5-5`; `claude-haiku-5-5` for sync updates), opt-in dependency.
- [ ] **P4.4** Open-core cloud: org freshness dashboard, cross-repo contracts, audit trail, SSO. CLI and MCP stay MIT.

## Don't build
A vector database, a hosted indexer, writers for every tool format, a bundled tokenizer, model-generated overview content, or anything that writes outside `.ai/` and managed blocks without an explicit flag.
