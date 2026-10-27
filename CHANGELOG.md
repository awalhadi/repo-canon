# Changelog

All notable changes to RepoCanon. Versions follow [semver](https://semver.org); before 1.0, minor versions may break.

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
