# Changelog

All notable changes to RepoCanon. Versions follow [semver](https://semver.org); before 1.0, minor versions may break.

## 0.7.0 — unreleased

### Added
- **Canon integrity lint.** `doctor` now fails on text in AGENTS.md, `.ai/` docs, skills and tool pointer files (CLAUDE.md, `.cursor/rules`, Copilot, Gemini, Windsurf, Cline) that steers the agent instead of informing it. It catches hidden characters (bidi overrides, zero-width marks, Unicode tag characters), "ignore previous instructions"-style overrides, rules that hide work from the user, fake `<system>` markers, and `curl … | sh`. A false positive can be silenced with `<!-- repocanon:allow-instruction -->` on that line.
- `doctor` warns about an AGENTS.md, CLAUDE.md, GEMINI.md or rules file anywhere in the repo that git does not track, since a build step or dependency can plant one.
- MCP writes (`rc_propose_adr`, `rc_checkpoint_state`) refuse the same patterns.
- `secrets` (and so the pre-commit hook, including hooks installed earlier) also blocks unsafe instructions in staged agent docs and pointer files. `--json` keeps its shape; each finding now has `type: secret | instruction`.
- **Rules at edit time.** The Claude Code plugin adds a `PreToolUse` hook (`repocanon agent-hook pre-edit`) on Read, Edit, Write, MultiEdit and NotebookEdit. The first time Claude reads or edits a file in a module, the hook adds that module's Invariants and Gotchas as context. Hook context reaches the model next to the tool's result, so firing on Read is what makes the rules arrive before the edit (at most ~300 tokens, once per module per session, labelled when the doc is stale). The rules no longer depend on the agent calling an MCP tool, which the benchmark showed headless agents never do.

### Changed (format)
- **Decisions are one file each.** `rc_propose_adr` writes `.ai/decisions/<date>-<slug>.md` with the id `D-<date>-<slug>` instead of adding a numbered `D-NNN` entry to `.ai/DECISIONS.md`. Two branches or agents recording decisions no longer collide on an id or conflict on merge. Existing `DECISIONS.md` entries are still read, count as duplicates, and can be superseded. The AGENTS.md rules digest lists both formats and now leaves out superseded decisions. If the digest conflicts after a merge, run `repocanon rules`.

### Changed
- **Every command's terminal output was redesigned.** Each one shows a header, aligned rows with one set of symbols and words, a one-line verdict, and **Next**: the exact commands to run. `status` and `doctor` show a Freshness meter. `doctor` groups findings into Errors, Warnings and Info and adds a token-budget table. `sync` lists the files to read for each module and the `git diff` to inspect.
- Colour appears only in an interactive terminal. It is never used with `NO_COLOR`, the new `--no-color` flag, `TERM=dumb`, `--json` or `--format=github`, and `FORCE_COLOR` forces it on. Symbols always come with a word, and older Windows consoles get an ASCII fallback.
- Help is grouped by task, and every command has `--help` with options and examples (`repocanon status --help`, `repocanon help sync`). Unknown commands suggest the closest match.
- Errors print as `✗ message` with a hint underneath; `--debug` adds the stack trace.
- `--json`, `--format=github`, `report`, `mcp` and `agent-hook` output is unchanged.

### Fixed
- Flags that take no value no longer swallow the next word: `repocanon stamp --force billing` stamps `billing`.
- `repocanon … | head` exits quietly instead of crashing when the pipe closes.

### Docs
- README: a terminal screenshot, real example output for `init`, `doctor`, `status`, `sync` and `setup` (checked by a test, so it can't drift), and a key to the output symbols.
- New `docs/PUBLISHING.md`: the full release guide for npm, `mcp-publisher publish` to the MCP Registry, git tags, the GitHub release, the Action tag, optional CI automation, and troubleshooting.

## 0.6.1 — 2026-10-27

### Added
- GitHub Action (`uses: awalhadi/repo-canon@v0.6`): doctor with inline annotations, a job summary, one pull-request comment kept up to date, and `fail-on: error | stale | never`.
- `repocanon report [--base=ref] [--format=markdown|json]`: which modules a branch changed with or without their docs, plus the Freshness Score, secrets and out-of-date rules.
- Freshness Score (0–100) in `status`, `doctor` and their `--json` output.
- `doctor --strict` fails on warnings too; `--format=github` (automatic for `--ci` in GitHub Actions) prints workflow annotations with file and line.
- `driftIgnore` and `drift` settings in `.repocanon.json`.
- MCP write tools: `rc_propose_adr` (numbered decision records), `rc_checkpoint_state` (STATE.md focus, in progress, known issues and change log, never auto-stamped), `rc_stamp` (agent stamps for named docs, never forced) and `rc_verify` (PASS/FAIL end-of-task check). Writes are refused when they contain secrets, pasted code, trees or dependency lists.
- `verified_by` in doc frontmatter: `human` from `repocanon stamp`, `agent` from `rc_stamp`. `status` shows `fresh (agent)`; `doctor` and the PR report list agent-verified docs for review.
- `repocanon skills [--check] [--json]` (also run by `init`): an Agent Skill, `.ai/skills/rc-verify-change/SKILL.md`, listing this repo's own format, lint, typecheck and test commands from package.json/composer.json scripts, Makefile, justfile, Taskfile and CI, with their sources. Every `.ai/skills/<name>/SKILL.md` is copied to `.claude/skills/` (Claude Code) and `.agents/skills/` (Cursor, Codex, Gemini CLI, Copilot) for the chosen tools. Edited sources are kept; skills RepoCanon didn't write are never overwritten; `doctor` warns on drift, conflicts and invalid skills, and the secret scan covers skills.
- Monorepo support: pnpm, npm, yarn and bun workspaces, lerna, nx, turbo, go.work, Cargo and uv workspaces. Library packages become one module each; apps with two or more features become `<app>-<feature>` modules. `.ai/INDEX.md` gets a Workspace table and package stacks reach the fill brief.
- Deeper presets: Next.js App Router segments (route groups, dynamic, private, parallel and intercepting routes handled; `api/<x>` joins `<x>`), flat Laravel and FastAPI apps grouped by domain name across layers, layered Go apps merged by domain, new `fastapi` and `nuxt` presets, nwidart `Modules/` and Filament resources for Laravel, and the NestJS `app.module.ts` shell skipped.
- `AGENTS.md` carries a digest of the project's rules and decisions (`.ai/CONVENTIONS.md` bullets and one line per `.ai/DECISIONS.md` entry, kept under about 700 tokens). It is regenerated by `init`, `rules` and `rc_propose_adr`, and checked by `doctor`, `rules --check` and the PR report. Turn it off with `"entryDigest": false`.
- Benchmark harness in `bench/` (not in the npm package): 8 tasks in JavaScript, Python, PHP and Rust, run by Claude Code under no context, a hand-written AGENTS.md, and RepoCanon with and without the digest. See `bench/README.md`. First run (160 runs, `claude-sonnet-5-5`): written rules took the pass rate from 8% to 100%; RepoCanon matched a hand-written AGENTS.md on correctness at about 1.5× the cost; the digest cut cost 8% against the pointer-only design.
- MCP tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`) on every tool.

### Changed
- **Only meaningful code changes make a doc stale.** Whitespace-only edits, tests, prose docs and lockfiles are ignored (and counted in the detail); renames still count. Set `"drift": "all"` for the previous behaviour.
- `status --json` returns `{ docs, score }` instead of an array.
- Module suggestions differ for monorepos, Next.js (no more `[slug]` or `(group)` modules) and flat Laravel/FastAPI apps. Existing module docs and their `code_paths` are untouched; only `INDEX.md` and `analyze --scaffold` see the new split.
- `AGENTS.md` no longer prints `Run: TODO` / `Lint: TODO`; only commands RepoCanon found are listed.
- Bun projects run scripts with `bun run <script>` (`bun test` is bun's own test runner, not your `test` script).

## 0.5.1 — 2026-10-27

### Added
- `repocanon adopt [--dry-run] [--move]`: imports CLAUDE.md, GEMINI.md, .windsurfrules, .clinerules, Copilot instructions, .cursorrules, always-on Cursor rules and Cline's memory-bank/ into `.ai/`, routing sections to the right doc and dropping inferable content and secrets; `--move` reduces originals to pointers once committed.
- `repocanon rules [--check]`: per-module scoped rule files — Cursor `.cursor/rules/rc-<module>.mdc` with `globs`, Copilot `.github/instructions/rc-<module>.instructions.md` with `applyTo`, and opt-in nested `AGENTS.md` pointers (`"nestedAgents": true`). `init` regenerates them, `doctor` warns when they drift.
- `repocanon setup [tool…]` registers the MCP server in `.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json` and `.gemini/settings.json` (only its own entry; invalid or commented JSON is left alone), and prints snippets for global configs (Windsurf, Cline, Codex).
- Claude Code plugin + marketplace (`/plugin marketplace add awalhadi/repo-canon`): MCP server, `repocanon` skill, SessionStart and Stop hooks.
- `repocanon agent-hook session-start|stop`: a session briefing (use `rc_context`, stale docs) and an end-of-turn reminder when a module's code changed without its doc.
- Secret scanning for `AGENTS.md` and `.ai/` docs: private keys, cloud/API tokens, JWTs, URLs with passwords and high-entropy password/token values. `doctor` reports them as errors, and a new `secrets [--staged] [--json] [--quiet]` command lists them masked.
- Context packs (`context`, `rc_context`) label stale, broken and unverified docs so agents trust the code there; `packContext()` returns `freshness`.
- `doctor` flags content agents can read from the code — directory trees, dependency/version lists, pasted source code and file catalogues — with `file:line` and a token estimate. These are warnings, so `doctor --ci` still passes.
- MCP Registry listing (`server.json`, `mcpName`): RepoCanon appears in the official registry as `io.github.awalhadi/repocanon`.

### Changed
- `prompt fill`, `prompt fill --compact` and `prompt update` tell agents to write only what the code can't show, with an explicit "Do not write" list.
- New `PROJECT.md` template: no duplicated Stack/Commands (they live in AGENTS.md); "Non-obvious architecture" replaces the architecture overview.
- The pre-commit hook now **blocks** commits that stage a secret in `AGENTS.md` or `.ai/` (override with `--no-verify`); re-run `repocanon hook` to upgrade a 0.5.0 hook in place.

## 0.5.0 — first npm release

### Breaking
- `repocanon stamp` needs a doc name or `--all`, matches names exactly, and refuses docs whose code has uncommitted changes (override with `--force`).
- `stampDocs()` returns `{ head, stamped, refused, unknown, needsTarget, known }` instead of an array.
- `packContext()` returns modules in relevance order and adds `scores`.
- `repocanon init` without a terminal writes pointer files only for saved or detected tools (use `--targets=all` for the old behaviour).
- ContextForge names are gone: the `contextforge` binary, `.contextforge.json`, `cf_*` MCP tool names and legacy block markers.

### Added
- Interactive tool picker in `init` (Claude Code, Cursor, GitHub Copilot, Gemini CLI / Antigravity, Windsurf, Cline, OpenAI Codex / ChatGPT), saved as `targets` in `.repocanon.json`.
- `init --targets=a,b|all|none`, `--yes`, `--prune`; re-runs print `Up to date` when nothing changed.
- `doctor` checks pointer files only for the tools you chose.

### Changed
- CLAUDE.md now holds `@AGENTS.md`, so Claude Code loads AGENTS.md natively.
- Context packs rank modules, ignore filler words, put rules before modules and cap any single doc at half the budget.
- `doctor` targets an entry context of ≤1,000 tokens and warns above 2,000.
