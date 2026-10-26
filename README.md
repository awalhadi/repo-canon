# RepoCanon
Stack-agnostic **project knowledge layer** for AI coding agents (Cursor, Claude Code, Windsurf, Copilot, Gemini, Cline, Antigravity…).
Agents read a compact `.ai/` folder instead of the whole repo → fewer tokens, project rules known upfront, changes tracked.

## Quick start
```bash
cd your-project
node /path/to/repocanon/bin/repocanon.js init   # later: npx repocanon init
repocanon prompt fill      # paste into your AI agent → fills .ai/ docs
repocanon hook             # optional pre-commit warning
# daily loop
repocanon sync --write     # what changed → which docs to update (.ai/.sync-report.md)
repocanon prompt update    # paste into agent; after it finishes:
repocanon stamp <module>
```

## Choosing tools
In a terminal, `init` opens a picker (↑/↓, space, `a` = all/none, enter) for the AI tools that should read the knowledge layer. `AGENTS.md` is always written; each tool you pick gets a small pointer file:

| id | tool | file written |
|---|---|---|
| `claude` | Claude Code | `CLAUDE.md` (`@AGENTS.md` import) |
| `cursor` | Cursor | `.cursor/rules/project.mdc` |
| `copilot` | GitHub Copilot | `.github/copilot-instructions.md` |
| `gemini` | Gemini CLI / Antigravity | `GEMINI.md` |
| `windsurf` | Windsurf | `.windsurfrules` |
| `cline` | Cline | `.clinerules` |
| `codex` | OpenAI Codex / ChatGPT | nothing extra — reads `AGENTS.md` natively |

Your choice is saved as `targets` in `.repocanon.json`. Re-running `init` reopens the picker with that choice and marks each tool `set up` or `detected`; if nothing changed it prints `Up to date`. Untick a tool and `init` offers to remove its RepoCanon block. Only that block goes: your own text stays, and the file is deleted only if nothing else is in it.

Scripts and CI (no terminal): `--targets=claude,cursor`, `--targets=all` or `--targets=none` picks directly; `--yes` keeps the saved choice (or the detected tools); `--prune` removes blocks of tools you no longer select.

## Install
```bash
cd /path/to/repocanon && npm link      # gives you the global `repocanon` command
# no npm link permission? alias instead:
echo "alias repocanon='node /path/to/repocanon/bin/repocanon.js'" >> ~/.zshrc && source ~/.zshrc
```

## Commands
| command | what it does |
|---|---|
| `init [--targets=a,b\|all\|none] [--yes] [--prune] [--force]` | `.ai/`, `AGENTS.md`, `.repocanon.json` + pointer files for the AI tools you pick (see [Choosing tools](#choosing-tools)); auto-detects stack + run/test cmds |
| `analyze [--scaffold]` | regenerates module/path map in `.ai/INDEX.md`; `--scaffold` creates module doc stubs with `code_paths` |
| `doctor [--ci] [--json]` | lint the layer: size caps, leftover TODOs, broken paths, missing IDE pointers, token budget vs repo |
| `context [words] [--files=a,b] [--max=N]` | print the budgeted context pack an agent should read for a task |
| `mcp` | MCP stdio server: `rc_context`, `rc_module`, `rc_find_owner`, `rc_status` (read-only) + `rc_prepare_fill`, `rc_sync_report` (agent calls these itself and writes the docs — no copy-paste) |
| `status [--ci] [--json]` | fresh / stale / broken / unverified per doc (broken = `code_paths` no longer exist) |
| `sync [--write] [--since=ref] [--json]` | changed files since each doc's `verified_at` → docs to update, `git diff` commands, signals (schema, routes, deps, config), unmapped files |
| `stamp <name…> \| --all [--force]` | set `verified_at` to current commit on docs you re-checked; exact names only, refuses when their code has uncommitted changes |
| `hook` | pre-commit warning (never blocks) |
| `prompt fill [--compact]` | rich, evidence-loaded brief (structure, dependency/env-key scan, git hotspots, per-stack playbook, phased work plan, self-review checklist, exact final-report format). `--compact` prints the short v0.2-style prompt instead |
| `prompt update` | prompt for syncing docs after code changes, pre-loaded with the `sync` report |

## Config: `.repocanon.json`
```json
{
  "preset": "auto",
  "moduleRoots": ["src/domains"],
  "modules": { "checkout": ["app/Services/Checkout/", "app/Models/Order.php"] },
  "exclude": ["legacy/", "vendor/"]
}
```
- `preset`: `auto` (from detected stack) or one of `laravel nextjs react vue nestjs node django rails go tauri`
- `moduleRoots`: extra folders whose child folders are modules
- `modules`: explicit module → paths (overrides auto-detected module of same name)
- `exclude`: path prefixes ignored everywhere

Presets merge the same domain across layers (e.g. Laravel `Billing` = Services + Actions + Controllers + Pages).

## Connecting the MCP server to your IDE agent
`repocanon mcp` is a stdio [MCP](https://modelcontextprotocol.io) server. Read-only tools: `rc_context`, `rc_module`, `rc_find_owner`, `rc_status`. Authoring tools: `rc_prepare_fill`, `rc_sync_report` — these return the same evidence brief as `prompt fill`/`sync`, but as a tool result your agent can act on directly, writing `.ai/*.md` with its own file tools (no copy-paste into chat). Once connected, just tell your agent **"update the context docs"**.

Every IDE points its agent at the same server command, just via a different config file:

```json
{ "mcpServers": { "repocanon": { "command": "repocanon", "args": ["mcp", "--root=/abs/path/to/project"] } } }
```

> If you didn't `npm link` (see [Install](#install)), replace `"command": "repocanon"` with `"command": "node", "args": ["/abs/path/to/repocanon/bin/repocanon.js", "mcp", "--root=/abs/path/to/project"]`.

### Claude Code
Create `.mcp.json` in your project root with the JSON block above, or run:
```bash
claude mcp add repocanon -- repocanon mcp --root=/abs/path/to/project
```

### Cursor
Create `.cursor/mcp.json` in the project (or `~/.cursor/mcp.json` for a global/all-projects server) with the JSON block above.

### Windsurf
Open Windsurf → Settings → Cascade → MCP Servers → "View raw config", which opens `~/.codeium/windsurf/mcp_config.json`. Add the JSON block above and save.

### VS Code (Copilot Agent mode)
Create `.vscode/mcp.json` in the project with the JSON block above (VS Code will offer a "Start" code lens above the server entry). Alternatively run **MCP: Add Server** from the Command Palette and point it at the same command/args.

### Cline
Open the Cline panel → MCP Servers icon → "Configure MCP Servers", which opens `cline_mcp_settings.json`. Add the JSON block above and save.

### Gemini CLI / Antigravity / any other MCP client
These all use the same `{"mcpServers": {...}}` shape — check that client's docs for where it stores MCP config (a JSON file or a settings UI) and paste the block above in.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for design, threat model and roadmap. For embedding as a library, project layout, and contributor notes, see [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md). Run tests: `npm test`.

## Principles
1. Docs = semantic index, never a code copy. **Code wins** on conflict.
2. Progressive disclosure: AGENTS.md → PROJECT → INDEX → one module → code.
3. Invariants and business rules over implementation detail.
4. Change-driven updates (Definition of Done) + git-based staleness (`verified_at`, `code_paths`).
5. Zero dependencies, Node ≥18.

## Roadmap
Phase-by-phase tracker (done / remaining): [docs/ROADMAP.md](docs/ROADMAP.md).
