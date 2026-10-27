# Changelog

All notable changes to RepoCanon. Versions follow [semver](https://semver.org); before 1.0, minor versions may break.

## 0.6.0 — unreleased

### Added
- GitHub Action (`uses: awalhadi/repo-canon@v0.6`): doctor with inline annotations, a job summary, one pull-request comment kept up to date, and `fail-on: error | stale | never`.
- `repocanon report [--base=ref] [--format=markdown|json]`: which modules a branch changed with or without their docs, plus the Freshness Score, secrets and out-of-date rules.
- Freshness Score (0–100) in `status`, `doctor` and their `--json` output.
- `doctor --strict` fails on warnings too; `--format=github` (automatic for `--ci` in GitHub Actions) prints workflow annotations with file and line.
- `driftIgnore` and `drift` settings in `.repocanon.json`.

### Changed
- **Only meaningful code changes make a doc stale.** Whitespace-only edits, tests, prose docs and lockfiles are ignored (and counted in the detail); renames still count. Set `"drift": "all"` for the previous behaviour.
- `status --json` returns `{ docs, score }` instead of an array.

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
