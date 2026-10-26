# RepoCanon — Architecture

## 1. Problem
AI coding agents re-discover a project on every task: they scan files, burn tokens, and still miss rules that code does not express (state machines, money/permission invariants, why a choice was made). Existing answers (one giant `CLAUDE.md`, ad-hoc notes) go stale silently and are IDE-specific.

## 2. Goals / Non-goals
**Goals** — (1) agent reads a small, structured, *budgeted* context instead of the repo; (2) knowledge is *verifiably fresh* (git-anchored); (3) works for any stack and any agent/IDE; (4) zero-dependency, read-mostly, safe to run anywhere; (5) the codebase itself stays trivially maintainable as commands and stacks are added.
**Non-goals** — not a code indexer/vector DB; does not call LLMs itself; does not auto-rewrite docs unattended; does not mirror source code.

## 3. Core principles
1. **Code is the source of truth; docs are a cache.** On conflict code wins, then the doc is fixed.
2. **Semantic index, not a code mirror.** Store *what/why/where + invariants*, never implementations.
3. **Progressive disclosure.** `AGENTS.md → PROJECT → INDEX → one module → code`. Budgeted by construction (`pack`/`context`, §6).
4. **Freshness is computed, not promised.** Every doc carries `verified_at` (commit) and modules carry `code_paths`; `git diff` decides staleness.
5. **Deterministic tooling, probabilistic authoring.** The tool does detection, mapping, staleness, budgeting (deterministic, testable, no LLM calls). The *agent* writes prose; the tool checks it (`doctor`).
6. **Least privilege.** Never executes repo code, no network, no shell (`execFile` only, ref allow-list — see §8), writes only `.ai/`, `.repocanon.json`, and marker-delimited blocks in agent-instruction files.
7. **One home per concern, enforced.** Every piece of logic lives in exactly one file, in exactly one layer; `test/architecture.test.js` fails the build if that stops being true (§7).

## 4. Layers
```
┌──────────────────────────────── Interfaces ─────────────────────────────────┐
│  bin/repocanon.js → cli/router.js → cli/commands/*.cmd.js  (I/O only)       │
│  mcp/server.js  (stdio JSON-RPC)  ·  cli/commands/mcp.cmd.js starts it      │
│  src/index.js — public facade (embed as a library: `require('repocanon')`)  │
├────────────────────────────────── Services ──────────────────────────────────┤
│  init · analyze · doctor · status · sync · pack · prompt · facts · hook      │
│  (one *.service.js each — pure functions of (root, options) → data)          │
├──────────────────────────────────── Core ─────────────────────────────────────┤
│  git (safe exec)  · fs (read/write/glob) · frontmatter · blocks (idempotent  │
│  injection) · tokens (estimate) · config (load+validate) · detector (stack)  │
│  · presets (per-framework module hints) · modules (resolver) · errors ·      │
│  constants                                                                    │
└────────────────────────────────────────────────────────────────────────────┘
```
**Dependency direction is one-way and mechanically enforced** (`test/architecture.test.js`):
`core → core only` · `services → core, services` · `mcp → core, services, mcp` · `cli → core, services, mcp, cli` · `index.js` (facade) may see everything. A file that violates this fails `npm test`, not just review.

Every `src/` file has exactly one job:

| path | responsibility |
|---|---|
| `core/git.js` | all git access — `execFile` only, ref allow-list, never a shell |
| `core/fs.js` | file read/write, file listing (`git ls-files` w/ fallback walk), slug, template render |
| `core/frontmatter.js` | parse / set / strip YAML-lite frontmatter |
| `core/blocks.js` | idempotent "managed block" injection into files the user also edits |
| `core/tokens.js` | token estimate (bytes/4) for a string or a whole repo |
| `core/config.js` | load + validate `.repocanon.json`; never throws — bad config warns and falls back to safe defaults (§8) |
| `core/detector.js` | stack detection (frameworks, run/test/lint commands) from manifest files |
| `core/presets.js` | per-framework "where do modules live" hints (roots / marker files) |
| `core/modules.js` | resolves file list + config + presets → module list (paths, file counts) |
| `core/errors.js` | typed error hierarchy (`RepoCanonError → ConfigurationError, GitError, CommandError`) |
| `core/constants.js` | shared literals (ignored dirs, status icons, …) |
| `services/init.service.js` | scaffolds `.ai/`, `AGENTS.md`, IDE pointers, `.repocanon.json` |
| `services/analyze.service.js` | regenerates `INDEX.md`'s auto block; `--scaffold` creates module stubs |
| `services/doctor.service.js` | lints the knowledge layer: size caps, TODOs, broken paths, missing pointers, token budget |
| `services/status.service.js` | per-doc freshness vs git; `stamp` |
| `services/sync.service.js` | what changed since each doc's `verified_at`, formatted report |
| `services/pack.service.js` | budgeted context assembly for a task (query/files → doc set, cut at `maxTokens`) |
| `services/prompt.service.js` | builds the rich, evidence-loaded fill brief (uses `facts.service`, per-stack playbook) |
| `services/facts.service.js` | deterministic evidence extraction: anchors, deps, env *key names only*, git hotspots |
| `services/hook.service.js` | installs the pre-commit warning |
| `cli/args.js` | argv → `{ command, args, flags, options, root, isJson, isCi, … }` |
| `cli/router.js` | dispatch table + single error/exit-code boundary (§8) |
| `cli/commands/*.cmd.js` | one file per subcommand; I/O and formatting only, no business logic |
| `cli/formatters.js` | help text, JSON printing, status icons |
| `mcp/server.js` | stdio JSON-RPC loop (`initialize`, `tools/list`, `tools/call`) |
| `mcp/tools.js` | tool schemas + dispatch to the same services the CLI uses |
| `index.js` | public facade: everything above, re-exported for embedding |

## 5. Data model
| artifact | role | owner |
|---|---|---|
| `AGENTS.md` (+ pointers) | entry point; read order + Definition of Done | tool-managed block + user text |
| `PROJECT.md` | purpose, stack, boundaries, commands | agent/human |
| `INDEX.md` | path→module map; *auto block* regenerated by `analyze` | tool (auto block) + human |
| `DOMAIN.md` | business rules, states, invariants, glossary | agent/human |
| `modules/<slug>.md` | frontmatter `module, verified_at, code_paths[]` + purpose/invariants/flow/code-map/gotchas | agent/human |
| `.repocanon.json` | `preset, moduleRoots, modules, exclude` | human |

**Module resolution** (deterministic, `core/modules.js`): presets (`roots` → child folders; `marker` → folder holding e.g. `*.module.ts`) merged by slug across layers → noise-folder filter (`vendor`, `.idea`, …) → `exclude` → explicit `modules` config override → a module doc's own `code_paths` win over everything.

**Staleness states**: `fresh · stale (code_paths changed since verified_at) · broken (paths vanished) · unverified · unknown-ref`.

## 6. Key flows
- **Bootstrap**: `init` → `prompt fill` (evidence-loaded: structure, signal counts, dependency/env-key scan, git hotspots, per-stack playbook) → agent fills → `doctor` → `stamp`.
- **Daily loop**: agent calls `context`/`rc_context` (or reads `AGENTS.md` order) → works → Definition of Done updates docs → `sync` shows drift → `stamp`.
- **Embedding**: `require('repocanon')` (via `src/index.js`) exposes every service as a plain function — build a bot, a GitHub Action, or a different UI on top without shelling out to the CLI.
- **CI/pre-commit**: `doctor --ci`, `status --ci` fail on broken structure/stale docs; hook only warns.

## 7. Maintainability guarantees (enforced by `npm test`, not convention)
| guarantee | test |
|---|---|
| No layering leaks (core doesn't reach into services/cli/mcp, services don't reach into cli, …) | `test/architecture.test.js` — walks the actual `require()` graph |
| No circular requires anywhere in `src/` | `test/architecture.test.js` |
| No duplicate "flat" files re-implementing what a layer already owns | `test/architecture.test.js` — asserts `src/` root contains only `index.js` |
| Public API surface stays intact (`src/index.js`) | `test/unit.test.js` |
| CLI behaves correctly end-to-end (real repos, real git, real subprocess) | `test/cli.e2e.test.js` |
| Ref/path arguments from doc frontmatter can never reach a shell | `test/cli.e2e.test.js` (injection attempt asserted to leave no trace) |

`test/unit.test.js` exercises `core/` and `services/` directly (fast, no subprocess). `test/cli.e2e.test.js` spawns the real `bin/repocanon.js` against temp git repos (slower, but catches wiring bugs unit tests can't — argv parsing, process exit codes, file output). Both are required; neither is a substitute for the other.

## 8. Error-handling policy (why two different styles coexist, on purpose)
Two layers behave differently on bad input, deliberately:
- **`core/config.js`, `core/git.js` never throw.** A malformed `.repocanon.json` or a git command that fails (e.g. diffing a ref that doesn't exist) is *expected input* for a CLI that runs against messy, real-world repos — it warns (config) or returns `null` (git) and the caller decides what that means. Crashing here would make the tool unusable on the very repos it needs to help with.
- **`cli/commands/*.cmd.js` throw `CommandError` (from `core/errors.js`) for genuine usage errors** — e.g. an unknown `prompt` subcommand. `cli/router.js` is the single catch point: it prints `error.message` and exits with `error.exitCode` (default `2`; `CommandError` can set its own, e.g. `1` for a "did you mean" style usage error). No command file calls `process.exit()` directly for an *error* path — `--ci` gates (`doctor --ci`, `status --ci`) are a different thing (a policy decision, not a failure) and exit intentionally.

## 9. Failure modes & mitigations
| risk | mitigation |
|---|---|
| Docs rot | git-anchored `verified_at`, `sync`, `status --ci`, pre-commit warning |
| Docs wrong/hallucinated | "TODO: verify, never guess" rule in every prompt; code-wins rule; `doctor` counts TODOs; human review via normal PRs |
| Docs bloat (defeats the purpose) | line caps + token estimate per doc; `doctor` warns; `pack()`/`context` hard-cuts at a token budget |
| Heuristic module detection is wrong | config override, `exclude`, doc-level `code_paths` win; presets are data, not code |
| Malicious/odd repo content | no shell (`execFile`), git ref allow-list, path args after `--`, MCP is read-only and slug-sanitised; covered by `test/cli.e2e.test.js` |
| Clobbering user files | managed blocks are idempotent; core docs never overwritten without `--force` |
| Architecture erosion over time | mechanically enforced by `test/architecture.test.js`, not left to review discipline |
| Huge monorepos | `git ls-files -z`, 256 MB buffer; per-package config planned (v0.5) |

## 10. Honest limits (what is NOT proven yet)
- **Token savings are unmeasured.** `doctor` reports an estimate (word/punctuation-aware, not a real tokenizer, as of v0.5) of entry-context vs repo size, which bounds the *input* side only. A benchmark harness (same tasks, with/without `.ai/`, measure tool calls + tokens + success) is the only way to claim a number.
- **`rc_prepare_fill`/`rc_sync_report` hand the calling agent a brief, not a guarantee.** They remove the human copy-paste step, but the agent still decides what to write; a bad agent can still write a bad doc. `doctor`/`status` catch structural drift after the fact, not authoring quality.
- Module detection quality depends on folder conventions; unusual layouts need config.
- Doc *quality* is only as good as the authoring agent; the tool verifies structure and freshness, not truth.
- `context`/`pack` query matching is keyword/substring-based (module slug, code paths, and — as of v0.4 — the module's own doc body). It is not semantic search; a query using vocabulary absent from both paths and doc body will miss a relevant module.

## 11. Roadmap
> Superseded by the phase tracker in [ROADMAP.md](ROADMAP.md); the history below is kept for context.

- **v0.4** *(done)* `rc_prepare_fill`/`rc_sync_report` MCP tools — an already-connected agent calls them and writes `.ai/*.md` with its own file tools; no human copy-paste required. Word/punctuation-aware token estimator replacing flat bytes/4.
- **v0.5** `npm publish` + `npx repocanon`; GitHub Action (CI drift-check, PR comment); benchmark harness; monorepo (per-package `.ai/`); `--fix` for safe auto-repairs (broken paths, pointer blocks).
- **v0.6** symbol-level map (optional tree-sitter/ctags) inside module code maps; drift detection on *symbols*, not just files; relevance-ranked `context` packing (keyword-overlap scoring within budget, still zero-dependency).
- **v0.7** plugin API for custom presets; optional `--ai` fill mode (direct Anthropic API call for non-agent CLI users; opt-in extra dependency, core stays zero-dep).
