# RepoCanon — Product Analysis, Market Position & Roadmap to "Developer-Loved"

## Context
User asked for a senior AI/agent-engineer review of RepoCanon (v0.4.0, ~4.6k LOC, zero-dep Node CLI + MCP server, renamed from ContextForge in `ac7cbf6`), a market comparison, and a feature/roadmap plan to make it a category-leading product. This is a strategy plan; implementation items are ordered so each phase ships independently.

---

## 1. What RepoCanon is today (honest assessment)

**Core idea:** a git-anchored, budgeted `.ai/` knowledge layer (PROJECT / INDEX / DOMAIN / CONVENTIONS / DECISIONS / STATE / modules/*.md) that any agent reads instead of the whole repo. The tool is deterministic (detect, map, stale-check, budget); the agent writes prose.

**Real strengths (keep these as the brand):**
- **Freshness is computed, not promised** — `verified_at` + `code_paths` + `git diff` → fresh/stale/broken (`src/services/status.service.js`, `sync.service.js`). *(Correction, 2026-10-28: this is no longer rare. agents-doctor, agentslint, bernstein agents-md, etymd, docverity, drft-cli, mex and repo-harness all check agent docs for stale paths or commands. What stays distinctive is the commit-anchored "verified at X, meaningful change since" model; see docs/STRATEGY.md › Update 2026-10-28.)*
- **Agent-agnostic** — AGENTS.md + IDE pointer files + MCP (`src/mcp/tools.js`), not locked to one IDE.
- **Zero deps, no network, no shell** (`src/core/git.js` execFile + ref allow-list) — easy enterprise/security sign-off.
- **Enforced architecture** (`test/architecture.test.js`) — contributors can't erode it.
- **Agent writes docs itself** via `rc_prepare_fill` / `rc_sync_report` — no copy-paste.

**Weaknesses / gaps:**
1. **Not published** (no `npx repocanon`) — biggest adoption blocker.
2. **No proof of value** — token savings unmeasured (ARCHITECTURE §10 admits it). Without a number, no viral story.
3. **Retrieval is substring-matching** (`pack.service.js`) — misses on vocabulary mismatch.
4. **File-level only** — no symbol map, so drift detection is coarse (any edit in a path = stale).
5. **Human-in-loop for staleness** — `stamp` is manual; no CI/PR bot yet.
6. **Brand rename half-done** — `bin/contextforge.js`, `cf_*` aliases, `.contextforge.json` refs in ~20 files (OK as back-compat, but needs a deprecation plan + docs cleanup).
7. **No monorepo support**, no UI/visual, no team/shared layer.

---

## 2. Market map (where RepoCanon sits)

| Category | Players | What they do | RepoCanon's angle |
|---|---|---|---|
| Static instruction files | CLAUDE.md, `.cursor/rules`, `AGENTS.md` standard, Copilot instructions, Windsurf rules, Kiro steering | Hand-written, IDE-specific, silently rot | **Generator + freshness checker for these** — become the "linter/compiler" for AGENTS.md |
| Memory banks | Cline Memory Bank, Windsurf/Cursor memories, Claude Code memory, ByteRover, mem0 | Agent-written notes, no verification | Git-anchored verification is the moat |
| Repo packers | Repomix, gitingest, code2prompt | Dump the whole repo into one prompt | Opposite philosophy: **semantic index, budgeted** |
| Code-graph / retrieval | Aider repo-map (tree-sitter), Serena MCP (LSP), Sourcegraph/Cody, Augment Context Engine, Greptile, Continue | Symbol/embedding retrieval, often hosted | Add *optional* symbol layer; stay local & deterministic |
| Auto-wikis | DeepWiki (Devin), Google CodeWiki, Swimm (doc-drift for humans) | Generated docs, hosted | **Swimm-style drift detection, but for agents, local, free** |
| Spec-driven dev | GitHub Spec Kit, Kiro specs, Task Master | Plans/specs per feature | Integrate: DECISIONS/STATE ↔ specs |
| Library docs | Context7, llms.txt | External API docs | Complementary — link out, don't compete |

**Positioning statement:** *"RepoCanon is the verified memory for AI coding agents — like a type-checker for your project knowledge. Every agent, every IDE, always fresh, never leaves your machine."*

Nearest threats: Swimm (if it goes agent-first), Augment/Greptile (hosted), and IDE vendors' built-in memory. Defense = open, local, cross-agent, and measurably fresh.

---

## 3. Feature roadmap

### Phase A — v0.5 "Ship & Prove" (adoption foundation, ~4–6 weeks)
1. **`npm publish` + `npx repocanon init`** — single-command onboarding; finish rename (keep `contextforge` bin + `cf_*` as deprecated aliases w/ warning, scrub docs/README).
2. **`repocanon setup <ide>`** — writes `.mcp.json` / `.cursor/mcp.json` / `.vscode/mcp.json` etc. automatically (replaces the long README MCP section). Extend `init.service.js`.
3. **Benchmark harness** (`bench/`) — fixed task set on 3–5 open-source repos, with/without `.ai/`, measuring tokens, tool calls, wall time, task pass rate. Publish results in README. *This is the marketing engine.*
4. **GitHub Action** `repocanon/action` — runs `status --ci` + `sync --json`, posts PR comment: "This PR touches `billing` — `.ai/modules/billing.md` is now stale." Reuse `sync.service.js` JSON output.
5. **`doctor --fix`** — safe auto-repairs: drop vanished `code_paths`, re-inject pointer blocks (`core/blocks.js`), regenerate INDEX auto block.
6. **Auto-stamp on agent completion** — `rc_stamp` MCP tool so the agent stamps docs it verified (closes the manual loop).

### Phase B — v0.6 "Smarter context" (quality moat)
7. **Ranked retrieval in `pack`** — BM25 over doc bodies + path tokens + synonyms from DOMAIN glossary; still zero-dep.
8. **Symbol map (optional)** — tree-sitter/ctags if available → module code maps list exported symbols; **symbol-level drift** (stale only if a documented symbol's signature changed). Massive precision win over file-level.
9. **Invariant checks** — DOMAIN.md invariants tagged with a code anchor (`@invariant order-total-nonneg → src/billing/total.ts#calcTotal`); `doctor` verifies anchors still resolve.
10. **`rc_impact` MCP tool** — "if I change file X, which modules/invariants/decisions are affected?" Before-edit guardrail for agents.
11. **Monorepo** — per-package `.ai/` with root aggregation; workspace detection (pnpm/nx/turbo/go.work).
12. **Export adapters** — `repocanon export cursor-rules|claude-md|copilot|llms.txt` compiles `.ai/` into each IDE's native format (one source, many targets — strongest "developer-loving" hook).

### Phase C — v0.7 "Ecosystem"
13. **Plugin API for presets** (data-only, as ARCHITECTURE promises) + community preset registry (Spring, .NET, Flutter, Rust/Axum, FastAPI, Phoenix…).
14. **Optional `--ai` fill mode** — direct Claude API call for CI/headless fills (opt-in dep; core stays zero-dep). Use latest models (`claude-sonnet-5-5` default, `claude-haiku-4-5` for cheap sync updates) with prompt caching.
15. **VS Code extension** — status-bar freshness, gutter hint "this file's module doc is stale", one-click "update docs with agent".
16. **Spec-kit / ADR integration** — import/export DECISIONS.md ↔ ADRs; link STATE.md to issues/PRs.
17. **Agent telemetry (local only)** — log which docs agents actually read via MCP; `doctor` flags never-read docs (dead weight) and hot modules lacking docs.

### Phase D — v1.0+ "Platform" (business model)
18. **RepoCanon Cloud (optional, paid)** — org dashboard: freshness score across repos, cross-repo knowledge (service A's contract seen from service B), SSO, audit. Open-core: CLI/MCP stay MIT forever.
19. **Knowledge quality score** — single 0–100 "Canon Score" per repo (coverage × freshness × invariant anchors × budget). Badge for READMEs → organic virality.
20. **Cross-repo / org canon** — shared CONVENTIONS & DOMAIN across microservices via git submodule or registry.

---

## 4. "Developer-loving" principles (product rules for every feature)
- **< 60 seconds to first value**: `npx repocanon init && repocanon setup claude` → agent already smarter.
- **Never block, never phone home** by default; every network/AI feature opt-in.
- **One source of truth, many outputs** (export adapters).
- **Show the number**: every command ends with tokens saved / freshness %.
- **Great errors**: "did you mean", fix suggestions (already started in `core/errors.js`).
- **Docs as product**: 2-min demo GIF, comparison page vs CLAUDE.md/Repomix/memory banks, benchmark table.

## 5. Go-to-market
1. Launch on HN/Reddit r/ClaudeAI, r/cursor with the **benchmark number** ("–X% tokens, +Y% task success").
2. Get listed in MCP registries (official MCP registry, Smithery, Cursor directory, Claude Code plugin marketplace — ship as a **Claude Code plugin** with skill + MCP bundled).
3. Contribute to the AGENTS.md standard; position as its reference tooling.
4. Preset bounty program → community contributions.
5. Metrics to track: weekly `npx` installs, GitHub stars, Action installs, % repos with Canon Score badge.

---

## 6. Recommended next step (first implementation slice)
Phase A items 1, 2, 4 first (publish + `setup` + GitHub Action) — highest adoption leverage, low risk, reuse existing services:
- `src/services/init.service.js` / new `src/services/setup.service.js` + `src/cli/commands/setup.cmd.js` (follow one-file-per-command pattern; architecture test enforces layering).
- `src/services/sync.service.js` JSON output → Action PR comment.
- `src/mcp/tools.js` add `rc_stamp` reusing `status.service.js` stamp.
- Then the benchmark harness (item 3) in parallel.

## Verification
- `npm test` (unit + e2e + architecture) stays green for every item.
- `npm pack` → install tarball in a temp project → `npx repocanon init`, `setup claude`, `mcp` handshake via `claude mcp list`.
- Action tested on a fork with a PR touching a mapped module → expect stale-doc comment.
- Benchmark harness produces a reproducible CSV + README table.
