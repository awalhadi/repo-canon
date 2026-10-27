# RepoCanon — Final Strategy & Roadmap

> Local snapshot of the [shared strategy doc](https://claude.ai/artifact/DsEYKvfTDf13nXRDy8hLn7), exported 2026-10-26.
> Live, phase-by-phase status is tracked in [ROADMAP.md](ROADMAP.md); update that file as work lands.

## Summary

**RepoCanon should be the verified canon for AI coding agents: only what code can't say (rules, decisions, boundaries, gotchas), loaded exactly where the agent works, proven fresh against git, enforced in CI.** It stays local, zero-dependency and works with every agent.

The engineering base is strong: enforced layering, safe git calls, and 23 of 23 tests passing at v0.4.0. The main risk is the market, not the code. 2026 research shows that auto-generated overview files hurt agents, and that is what `prompt fill` produces today. The plan below fixes trust bugs first, makes the product lean and path-scoped, proves the value with a benchmark, and then builds enforcement as the moat.

## Verified facts that change the plan

Five checked facts reshape the roadmap. The "anujkushwaha612/ContextForge AST proxy" could not be confirmed and is left out.

| Fact | Consequence for RepoCanon |
| --- | --- |
| `repocanon` and `contextforge` are both unclaimed on npm. [IBM mcp-context-forge](https://github.com/ibm/mcp-context-forge) (about 4k stars) owns the ContextForge name in MCP. | Drop ContextForge now. With no published users, a clean break costs almost nothing. Claim `repocanon` on npm today. |
| [Claude Code reads AGENTS.md](https://www.developersdigest.tech/blog/claude-code-agents-md-support) since v2.1.277 (Sept 2026), by default only when no CLAUDE.md exists. Nested AGENTS.md files load when a file in that folder is read. | `init` writes a pointer CLAUDE.md, which turns off native loading and costs an extra read. CLAUDE.md should contain `@AGENTS.md`, or not exist. |
| [rulesync](https://developertoolkit.ai/en/ecosystem/frameworks/rules-sync/) already writes rules, MCP config, commands and skills for 20+ tools, and shipped majors 18 to 21 in about two days in Sept 2026. | Multi-format output is a commodity. Write only path-scoped formats, and be the stable alternative to fast churn. |
| [Repomix](https://rywalker.com/research/repomix) (about 26k stars) has tree-sitter `--compress` (about 70% fewer tokens) and an MCP server. | Symbol export alone is not a differentiator. Use symbols as drift anchors, not as content. |
| [ETH Zurich, Feb 2026](https://the-decoder.com/?p=32204): auto-generated context files lowered success in 5 of 8 settings and raised cost by more than 20%. | Every feature must add what the agent can't infer from code. |

## Verdict on each proposed idea

**14 of the 18 proposed ideas stay as proposed, 3 change shape, and 1 claim is dropped.** Ordered roughly by priority.

| Idea | Verdict | Why, or what to change |
| --- | --- | --- |
| Drop ContextForge completely | Keep | Remove `bin/contextforge.js`, `templates/contextforge.json`, `cf_*` aliases, legacy block markers and old JSDoc headers. |
| Hierarchical AGENTS.md and Cursor `.mdc` compiled from modules | Keep | Top priority: context loads for the area being edited with no tool call. Write nested AGENTS.md, `.cursor/rules/<module>.mdc` with `globs`, Copilot `applyTo`, CLAUDE.md as `@AGENTS.md`. Add a doctor drift check. |
| Exact BPE tokenizer | Change | Claude's tokenizer isn't public, and one model's count is wrong for another. Calibrate the heuristic once, report a ±15% range, offer exact counts only in opt-in `--ai` mode. |
| web-tree-sitter (WASM) symbol extraction | Change | Grammars add megabytes and break zero-dep. Ship regex extractors for the top 6 stacks first; tree-sitter becomes an optional plugin. Symbols feed anchors, not doc text. |
| Module dependency matrix | Keep | Keep as data for ranking and `rc_impact`. Leave the Mermaid diagram out of agent context; render it for humans. |
| Semantic drift, Freshness Score, `doctor --ci --strict` | Keep | Count only meaningful changes. Fix the stamp bugs first, or the score is meaningless. |
| Secret and PII scanner | Keep | Move it up: agents now write `.ai/`. Zero-dep regex plus entropy in doctor, the hook and every MCP write. |
| MCP write tools (ADR, checkpoint, query, verify) | Keep | Value is validation (schema, numbering, secret scan, caps). Never auto-stamp inside `checkpoint_state`; writing state is not verifying. Writes stay inside `.ai/`. |
| SKILL.md generator | Keep | Procedures leave the root file and load on demand. One source in `.ai/skills/`, written out per tool. Generate only from evidence (scripts, Makefile, CI). |
| `context --for-diff` with ranked packing | Keep | Add BM25-style ranking, stopwords, core rules first, freshness labels, estimator-consistent truncation. |
| Deep stack presets and monorepos | Keep | Monorepo support moves up because large teams pay for it. |
| Executable architecture boundaries | Keep | Small zero-dep import checker for simple cases; generate configs for dependency-cruiser and eslint-boundaries; feed failures back to the agent. This is the moat. |
| Session handoff packet | Change | Drop "signed"; native features overlap. Keep it as STATE.md plus branch diff plus failing tests. Medium priority. |
| GitHub Action and PR comment | Keep | Cheapest path to team adoption. |
| VS Code / Open VSX extension | Keep | After the CLI's numbers are proven. |
| `repocanon adopt` importer | Keep | High leverage: removes switching cost. Strip inferable content during import and show the saving. |
| Benchmark | Keep | Add a hand-written AGENTS.md baseline. At least 5 runs each, measure correctness and tokens. |
| "Agents hallucinate 80% less" | Drop | No source supports it. Publish only measured numbers. |

**Gaps the idea list missed:**

1. Trust bugs: bare `stamp` marks every doc fresh, `stamp <name>` matches by substring, stamping ignores uncommitted changes, `pack` is unranked and drops core rules first.
2. A lint for inferable content, and an entry context under about 1k tokens (doctor warns only at 6000 today).
3. Freshness labels inside context output ("stale, trust the code").
4. A Claude Code plugin with `SessionStart` and `Stop` hooks, so the Definition of Done is enforced rather than suggested.

## Market map

**No product today combines knowledge the agent can't infer, proof it is current, enforcement, and support for every agent. Each competitor covers one of the four.**

| Layer | Players | Status | RepoCanon's role |
| --- | --- | --- | --- |
| Standards | AGENTS.md (AAIF), [Agent Skills](https://agentskills.io/), MCP | Settled | Follow closely; be the reference tool for verifying content |
| Rule distribution | [rulesync, Ruler](https://developertoolkit.ai/en/ecosystem/frameworks/rules-sync/) | Commodity, fast churn | Write only path-scoped formats; `adopt` reads their sources |
| Raw code packing | [Repomix](https://repomix.com/guide/mcp-server), gitingest, code2prompt | Mature | Opposite approach; don't compete |
| Code retrieval | [Augment Context Engine](https://www.augmentcode.com/changelog/context-engine-mcp-in-ga), Serena, Aider repo-map, Sourcegraph | Well funded, hosted or heavy | Stay deterministic and local; add symbol anchors only |
| Auto-wikis | DeepWiki, [Google Code Wiki](https://www.theregister.com/2025/11/17/google_previews_code_wiki/) | Regenerate docs; unstable output | Verified, stable docs owned by humans and agents together |
| Agent memory | ByteRover, Cline Memory Bank, native IDE memory | Notes without verification | Git-anchored, CI-checked |
| Architecture enforcement | dependency-cruiser, eslint-boundaries, Nx, ArchUnit | Mature, not agent-aware | Join them to the knowledge layer |

The main risks are IDE vendors adding drift checks to native memory, AGENTS.md adding path-scoping frontmatter, and rulesync adding verification. The answers are cross-agent CI enforcement, following the standard immediately, and shipping anchors and boundary checks first.

## Needs by project type

**Every project type needs the same four things: context that doesn't lie, context loaded for the area being edited, rules that get enforced, and proof it pays off.** That is the core product. The types differ in which feature matters first.

| Project type | Need now (2026) | Need by 2027–28 | Features that serve it |
| --- | --- | --- | --- |
| Solo / indie app | Setup under 60 seconds; fewer wasted tokens; any IDE | Several agents in parallel on one repo | `npx init`, `adopt`, plugin with hooks, lean entry file |
| Startup product | Domain rules survive team growth; fast onboarding of people and agents | Unattended cloud agents opening PRs | Anchored invariants, PR bot, `rc_impact`, STATE handoff |
| Agency / multi-client | Consistent setup across many repos and stacks | Reusable conventions across clients | Deep presets, shared CONVENTIONS via `extends:`, Canon Score per repo |
| Monorepo / platform team | Context per package; module boundaries | Cross-service contracts | Monorepo detection, nested AGENTS.md, boundary checker, cross-repo canon |
| Enterprise / regulated | No network, no leaks, auditable | Agent governance: who changed what under which rule | Secret scanner, `verified_by` audit trail, CI gates, optional org dashboard |
| OSS library | Contributor agents follow project rules; public API stability | Floods of agent-written PRs | Public-API anchors, `doctor --ci` on PRs, contribution skills |
| Legacy / brownfield | Unwritten rules; risky areas | AI-assisted migrations | Gotcha mining from git, DECISIONS records, hotspot warnings |

Larger context windows and native IDE memory will shrink the value of saving tokens. Parallel and unattended agents will raise the value of verification, enforcement and audit, so the product is planned around the second trend.

## Roadmap tracker

**24 items across five phases; 5 are done (Phase 0 on branch phase-0-trust, P1.7 on feat/init-targets) and 19 remain.** Change each Status chip as work lands. The same list lives in the repo at [ROADMAP.md](ROADMAP.md).

| ID | Phase | Item | Status |
| --- | --- | --- | --- |
| P0.1 | 0 · Trust (week 1) | Remove ContextForge; claim `repocanon` on npm, MCP registry, Open VSX | Done |
| P0.2 | 0 · Trust (week 1) | Fix `stamp`: exact slug match, bare stamp needs `--all`, refuse on uncommitted changes in `code_paths` | Done |
| P0.3 | 0 · Trust (week 1) | Fix `pack`: ranking, stopwords, core rules first, estimator-consistent truncation | Done |
| P0.4 | 0 · Trust (week 1) | CLAUDE.md as `@AGENTS.md`; entry budget target about 1k tokens | Done |
| P1.1 | 1 · v0.5 (about 4 weeks) | Inferable-content lint; rewrite the `prompt fill` brief | Not started |
| P1.2 | 1 · v0.5 (about 4 weeks) | Path-scoped writers: nested AGENTS.md, Cursor `.mdc` globs, Copilot `applyTo`, doctor drift check | Not started |
| P1.3 | 1 · v0.5 (about 4 weeks) | `repocanon adopt` importer | Not started |
| P1.4 | 1 · v0.5 (about 4 weeks) | Secret and PII scanner in doctor, hook and MCP writes | Not started |
| P1.5 | 1 · v0.5 (about 4 weeks) | Claude Code plugin (MCP, SKILL.md, `SessionStart`/`Stop` hooks) and `setup <ide>` | Not started |
| P1.6 | 1 · v0.5 (about 4 weeks) | Freshness labels on every `rc_context` section | Not started |
| P1.7 | 1 · v0.5 (about 4 weeks) | Interactive tool picker in init (Claude Code, Cursor, Copilot, Gemini, Windsurf, Cline, Codex/ChatGPT); saved targets; safe re-runs | Done |
| P2.1 | 2 · v0.6 (1–2 months) | Benchmark: no context vs hand-written AGENTS.md vs RepoCanon, at least 5 runs | Not started |
| P2.2 | 2 · v0.6 (1–2 months) | Meaningful-change drift, Freshness Score, `doctor --ci --strict`, GitHub Action PR comment | Not started |
| P2.3 | 2 · v0.6 (1–2 months) | MCP write tools: `rc_propose_adr`, `rc_checkpoint_state`, `rc_stamp` with `verified_by`, `rc_verify` | Not started |
| P2.4 | 2 · v0.6 (1–2 months) | SKILL.md generator from repo evidence | Not started |
| P2.5 | 2 · v0.6 (1–2 months) | Monorepo support and deep presets | Not started |
| P3.1 | 3 · v0.7 (3–6 months) | Anchored invariants, checked claims, `rc_impact` | Not started |
| P3.2 | 3 · v0.7 (3–6 months) | Boundary rules: zero-dep checker plus generated dependency-cruiser / eslint-boundaries configs | Not started |
| P3.3 | 3 · v0.7 (3–6 months) | `context --for-diff` with modules one import away; optional tree-sitter plugin | Not started |
| P3.4 | 3 · v0.7 (3–6 months) | Gotcha mining from git history; STATE handoff | Not started |
| P4.1 | 4 · v1.0+ | VS Code extension; Canon Score badge | Not started |
| P4.2 | 4 · v1.0+ | Parallel-agent coordination (claims and locks in STATE.md) | Not started |
| P4.3 | 4 · v1.0+ | Optional `--ai` headless fill (`claude-sonnet-5-5`, `claude-haiku-5-5` for sync) | Not started |
| P4.4 | 4 · v1.0+ | Open-core cloud: org dashboard, cross-repo contracts, audit, SSO | Not started |

**Phase gates:** Phase 0 closes when `npm test` is green with new stamp tests. Phase 1 closes when install-to-first-value is under 60 seconds on a fresh repo. Phase 2 closes when benchmark results are published. Phase 3 closes when a boundary violation fails CI with a fix message the agent can act on.

**Don't build:** a vector database, a hosted indexer, writers for every tool format, a bundled tokenizer, model-generated overview content, or anything that writes outside `.ai/` and managed blocks without an explicit flag.

## Success metrics

**Success is a measured correctness gain over a hand-written AGENTS.md, published with a method others can rerun.**

| Metric | Target or signal |
| --- | --- |
| Time from install to first value | Under 60 seconds |
| Benchmark vs hand-written AGENTS.md | Correctness gain, at least 5 runs per setup |
| Weekly `npx`, plugin and Action installs | Rising week over week |
| Median Freshness Score across adopting repos | Tracked from v0.6 |
| `rc_context` calls with no stale sections | Share rising over time |

## Next five moves

The benchmark runs in parallel from week 2.

- [ ] Claim `repocanon` on npm *(ContextForge removed — P0.1; npm claim pending)*
- [x] Fix the `stamp` and `pack` trust bugs
- [ ] Ship path-scoped writers and CLAUDE.md as `@AGENTS.md`
- [ ] Ship `adopt` with the inferable-content lint
- [ ] Ship the Claude Code plugin with `SessionStart` and `Stop` hooks

## Sources

Code findings come from the RepoCanon repository at commit 7632ef4.

- [ETH Zurich findings (the-decoder)](https://the-decoder.com/?p=32204)
- [Three studies on auto-generated AGENTS.md](https://codex.danielvaughan.com/2026/07/27/do-auto-generated-agents-md-files-actually-help-codex-cli/)
- [AAIF: Measuring AGENTS.md](https://aaif.io/blog/measuring-agents-md-what-five-runs-show-that-one-doesn-t)
- [AGENTS.md under Linux Foundation governance](https://codex.danielvaughan.com/2026/04/07/agents-md-open-standard-cross-tool-portability)
- [Claude Code reads AGENTS.md](https://www.developersdigest.tech/blog/claude-code-agents-md-support)
- [Claude Code AGENTS.md fallback](https://braindetox.kr/en/posts/claude_code_agents_md_fallback_2026.html)
- [rulesync and Ruler guide](https://developertoolkit.ai/en/ecosystem/frameworks/rules-sync/)
- [Cursor Project Rules](https://docs.cursor.com/context/rules)
- [IBM mcp-context-forge](https://github.com/ibm/mcp-context-forge)
- [Repomix review](https://rywalker.com/research/repomix)
- [Repomix MCP server](https://repomix.com/guide/mcp-server)
- [Augment Context Engine MCP](https://www.augmentcode.com/changelog/context-engine-mcp-in-ga)
- [Google Code Wiki (The Register)](https://www.theregister.com/2025/11/17/google_previews_code_wiki/)
- [Agent Skills (agentskills.io)](https://agentskills.io/)
- [Claude Code plugin marketplace explained](https://www.alexcloudstar.com/blog/claude-code-plugin-marketplace-skills-2026)
