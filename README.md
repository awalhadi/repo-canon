# RepoCanon

**Verified AGENTS.md and project memory for AI coding agents.** One small `.ai/` folder tells Claude Code, Cursor, GitHub Copilot, OpenAI Codex, Gemini CLI, Windsurf and Cline how your project works, and git checks that it is still true.

[![npm version](https://img.shields.io/npm/v/repocanon)](https://www.npmjs.com/package/repocanon)
[![npm downloads](https://img.shields.io/npm/dm/repocanon)](https://www.npmjs.com/package/repocanon)
[![license: MIT](https://img.shields.io/npm/l/repocanon)](LICENSE)
[![node](https://img.shields.io/node/v/repocanon)](https://nodejs.org)
[![dependencies: 0](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)
[![MCP server](https://img.shields.io/badge/MCP-server-blue)](#connect-the-mcp-server)

Sponsored by **[Framimo](https://framimo.com)** — turn any clip into GIF, WebP, AVIF or MP4, right in your browser.

## Why

- **Agents re-learn your repo on every task.** They scan files, burn tokens, and still miss the rules code doesn't show: state machines, money and permission invariants, why a choice was made.
- **Hand-written `CLAUDE.md` and rules files rot silently.** Nobody notices when they stop matching the code.
- **Every tool wants its own file.** CLAUDE.md, `.cursor/rules`, Copilot instructions, GEMINI.md, `.windsurfrules`, `.clinerules`…

RepoCanon keeps **one** knowledge layer (`AGENTS.md` + `.ai/`), points every tool you use at it, and uses git to tell you which docs went stale after a code change. It runs locally, calls no LLM and has zero dependencies.

## Quick start

Requires Node.js 18+ and a git repository.

```bash
cd your-project
npx repocanon init          # pick your AI tools (↑/↓, space, enter)
```

Then let your agent fill the docs. Either:

- **With MCP** (`npx repocanon setup`, [details](#connect-the-mcp-server)): tell your agent *"Fill the RepoCanon docs"*. It calls `rc_prepare_fill` and writes `.ai/*.md` itself.
- **Without MCP:** run `npx repocanon prompt fill` and paste the output into your agent.

Finally, check the result and commit:

```bash
npx repocanon doctor        # lint: size caps, TODOs, broken paths, token budget, content agents can infer
git add -A && git commit -m "Add RepoCanon knowledge layer"
npx repocanon stamp --all   # mark the docs verified at that commit
git commit -am "Verify RepoCanon docs"
```

## What you get

```
AGENTS.md                 entry point every agent reads: run/test commands, rules, Definition of Done
.ai/
  PROJECT.md              purpose, stack, boundaries
  INDEX.md                path → module map (auto block refreshed by `analyze`)
  DOMAIN.md               business rules, states, invariants, glossary
  CONVENTIONS.md          coding style and patterns
  DECISIONS.md            why things are built this way
  STATE.md                current focus and recent changes
  modules/<name>.md       one doc per module: purpose, invariants, flow, code map, gotchas
.repocanon.json           config (presets, modules, excludes, chosen tools)
CLAUDE.md, .cursor/…      small pointer files, only for the tools you pick
```

Docs are a semantic index, never a copy of the code. When docs and code disagree, **code wins** and the doc gets fixed.

## Choosing tools

`init` opens a picker for the AI tools that should read the knowledge layer. `AGENTS.md` is always written; each tool you pick gets a small pointer file:

| id | Tool | File written |
|---|---|---|
| `claude` | Claude Code | `CLAUDE.md` (`@AGENTS.md` import) |
| `cursor` | Cursor | `.cursor/rules/project.mdc` |
| `copilot` | GitHub Copilot | `.github/copilot-instructions.md` |
| `gemini` | Gemini CLI / Antigravity | `GEMINI.md` |
| `windsurf` | Windsurf | `.windsurfrules` |
| `cline` | Cline | `.clinerules` |
| `codex` | OpenAI Codex / ChatGPT | nothing extra — reads `AGENTS.md` natively |

- **Re-run any time.** `init` reopens the picker with your saved choice and marks each tool `set up` or `detected`. If nothing changed it prints `Up to date`.
- **Untick a tool** and `init` offers to remove its RepoCanon block. Only that block goes: your own text stays, and a file is deleted only if nothing else is in it.
- **Scripts and CI** (no terminal): `--targets=claude,cursor`, `--targets=all` or `--targets=none`; `--yes` keeps the saved choice; `--prune` removes blocks of tools you no longer select.

## Scoped rules: module knowledge exactly where the agent is editing

`npx repocanon rules` turns each filled module doc into rule files that a tool loads **only while the agent edits that module's files** — no tool call, no extra tokens anywhere else:

| Tool | File | Loaded when editing |
|---|---|---|
| Cursor | `.cursor/rules/rc-<module>.mdc` (`globs`, `alwaysApply: false`) | files under the module's `code_paths` |
| GitHub Copilot | `.github/instructions/rc-<module>.instructions.md` (`applyTo`) | the same files |
| Codex, Claude Code (opt-in) | `<module folder>/AGENTS.md` with a pointer to the module doc | anything in that folder |

- `.ai/modules/<module>.md` stays the single source. Generated files say so in their header; edit the doc, then run `rules` again.
- Files are written only for the tools you selected in `init`. Nested `AGENTS.md` pointers are off by default; turn them on with `"nestedAgents": true` in `.repocanon.json`.
- Modules whose doc is still the empty template get nothing. Removed docs and deselected tools have their generated files cleaned up; your own rule files are never touched.
- `init` runs `rules` for you, `doctor` warns when the files are out of date, and `rules --check` fails CI until they're regenerated.

## Daily workflow

After you or your agent change code:

```bash
npx repocanon sync          # which docs are stale, which files changed, what to inspect
# your agent updates the affected .ai/*.md (or: npx repocanon prompt update → paste)
git commit -am "Update billing + docs"
npx repocanon stamp billing # mark only the docs you actually re-checked (code must be committed)
```

The stamp edits `verified_at` in that doc; it rides along with your next commit.

With MCP connected, just say *"update the context docs"*: the agent calls `rc_sync_report` and edits the docs itself.

Optional: `npx repocanon hook` installs a pre-commit hook. It warns when code changes without any `.ai/` update (never blocks), and **blocks** a commit that would add an API key, token or password to `AGENTS.md` or `.ai/` docs (`git commit --no-verify` overrides). The secret check needs RepoCanon installed locally (`npm i -D repocanon`) or globally.

## Connect the MCP server

`repocanon mcp` is a stdio [Model Context Protocol](https://modelcontextprotocol.io) server. Agents use it to fetch a budgeted context pack instead of scanning the repo, and to update the docs without copy-paste.

**Let RepoCanon write the config:**

```bash
npx repocanon setup              # the tools you picked in init
npx repocanon setup cursor copilot
```

`setup` adds only its own `repocanon` entry: other servers and settings in the file stay as they are, and re-running it changes nothing. A file that isn't plain JSON (for example `.vscode/mcp.json` with comments) is left alone and you get the block to paste. Tools with a global config (Windsurf, Cline, Codex) get a ready-to-paste snippet with your project path.

**Or add it by hand.** Most tools take this block:

```json
{
  "mcpServers": {
    "repocanon": { "command": "npx", "args": ["-y", "repocanon", "mcp"] }
  }
}
```

| Tool | Where it goes |
|---|---|
| Claude Code | `.mcp.json` in the project, or `claude mcp add repocanon -- npx -y repocanon mcp` |
| Cursor | `.cursor/mcp.json` in the project |
| VS Code (Copilot agent mode) | `.vscode/mcp.json` — this file uses `"servers"` instead of `"mcpServers"` |
| Gemini CLI | `.gemini/settings.json` in the project |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` (Settings → Cascade → MCP Servers) |
| Cline | Cline panel → MCP Servers → Configure (`cline_mcp_settings.json`) |
| OpenAI Codex | `~/.codex/config.toml`: `[mcp_servers.repocanon]` with `command = "npx"`, `args = ["-y", "repocanon", "mcp", "--root=/abs/path"]` |

The server works on the folder it starts in. Global configs (Windsurf, Cline) usually start outside your project, so add the path: `"args": ["-y", "repocanon", "mcp", "--root=/abs/path/to/project"]`.

| MCP tool | What it returns |
|---|---|
| `rc_context` | Budgeted context for a task: rules + the most relevant module docs, with stale docs labelled so the agent trusts the code there. Call it first. |
| `rc_module` | One module's full doc |
| `rc_find_owner` | Which module owns a file |
| `rc_status` | Freshness of every doc vs git |
| `rc_prepare_fill` | Evidence-loaded brief for writing the docs |
| `rc_sync_report` | What changed since each doc was verified |

## Claude Code plugin

The plugin connects Claude Code to the knowledge layer with one install, and keeps the docs current while Claude works:

```text
/plugin marketplace add awalhadi/repo-canon
/plugin install repocanon@repocanon
```

| Part | What it does |
|---|---|
| MCP server | `rc_context`, `rc_sync_report` and the other tools above, for the project you open |
| Session start | Tells Claude the layer exists, to call `rc_context` before exploring, and which docs are stale |
| End of turn | If Claude changed a module's code but not its doc, asks it **once** to update the doc or say no change is needed |
| `repocanon` skill | The workflow: context first, update docs after changes, never paste code, file lists or secrets |

The hooks do nothing in projects without an `.ai/` folder. They run `npx repocanon`, so the first session downloads it once.

## Use in CI

Fail a pull request when the knowledge layer is broken or stale:

```yaml
# .github/workflows/repocanon.yml
name: repocanon
on: [pull_request]
jobs:
  docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }   # full history, so verified_at commits resolve
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npx -y repocanon doctor --ci   # fails on structural errors
      - run: npx -y repocanon status --ci   # fails on stale or broken docs
      - run: npx -y repocanon rules --check # fails when scoped rule files are out of date
```

## Commands

| Command | What it does |
|---|---|
| `init [--targets=a,b\|all\|none] [--yes] [--prune] [--force]` | Create `.ai/`, `AGENTS.md`, `.repocanon.json` and pointer files for the tools you pick; detects stack and run/test commands |
| `analyze [--scaffold]` | Refresh the module map in `.ai/INDEX.md`; `--scaffold` creates module doc stubs |
| `doctor [--ci] [--json]` | Lint the layer: secrets (error), size caps, TODOs, broken paths, missing pointers, token budget, and content agents can read from the code (directory trees, dependency lists, pasted code, file catalogues) |
| `status [--ci] [--json]` | Each doc: fresh / stale / broken / unverified |
| `sync [--write] [--since=ref] [--json]` | Code changed since each doc was verified → docs to update (`--write` saves `.ai/.sync-report.md`) |
| `context [words…] [--files=a,b] [--max=4000]` | Print the budgeted context pack for a task; stale docs are labelled |
| `stamp <name…> \| --all [--force]` | Mark docs verified at the current commit; refuses when their code has uncommitted changes |
| `prompt fill [--compact]` | Brief to paste into an agent so it fills the docs |
| `prompt update` | Brief for updating docs after code changes |
| `secrets [--staged] [--json] [--quiet]` | Scan `AGENTS.md` and `.ai/` (or their staged versions) for API keys, tokens and passwords; exits 1 if any are found |
| `hook` | Install the pre-commit hook: warns on undocumented code changes, blocks secrets in docs |
| `rules [--check] [--json]` | Write per-module scoped rule files (Cursor, Copilot, optional nested `AGENTS.md`); `--check` exits 1 if out of date |
| `setup [tool…\|all] [--json]` | Register the MCP server in each tool's config (default: the tools `init` set up) |
| `mcp` | Start the MCP server on stdio |
| `agent-hook <session-start\|stop>` | Output for agent hooks: session briefing, end-of-turn doc reminder (used by the Claude Code plugin) |

Global flags: `--root=<dir>` runs against another folder; `--version`; `--help`.

## Configuration

`.repocanon.json` (created by `init`):

```json
{
  "preset": "auto",
  "moduleRoots": ["src/domains"],
  "modules": { "checkout": ["app/Services/Checkout/", "app/Models/Order.php"] },
  "exclude": ["legacy/", "vendor/"],
  "targets": ["claude", "cursor"],
  "nestedAgents": false
}
```

- `preset`: `auto` (from the detected stack) or one of `laravel nextjs react vue nestjs node django rails go tauri`. Presets merge one domain across layers, e.g. Laravel `Billing` = Services + Actions + Controllers + Pages.
- `moduleRoots`: extra folders whose child folders are modules.
- `modules`: explicit module → paths; overrides a detected module with the same name.
- `exclude`: path prefixes ignored everywhere.
- `targets`: the AI tools `init` set up (managed by the picker).
- `nestedAgents`: also write a pointer `AGENTS.md` into each module folder (default `false`).

## How it compares

| | Cross-tool | Checked against git | Token-budgeted | Local, no LLM calls |
|---|---|---|---|---|
| Hand-written `CLAUDE.md` / rules files | one file per tool | no | no | yes |
| Repo packers (e.g. Repomix) | yes | n/a — packs raw code | partly | yes |
| Agent memory banks | usually one tool | no | no | varies |
| **RepoCanon** | **yes** | **yes** (`verified_at`, `code_paths`) | **yes** | **yes** |

Repo packers show an agent *what the code is*. RepoCanon records what the code can't say — rules, decisions, boundaries — and tells you when that record goes stale.

## FAQ

**Does it call an LLM or upload my code?** No. RepoCanon never makes network calls. Your own agent reads and writes the docs.

**What if an agent pastes a secret into the docs?** `doctor` reports it as an error (so `doctor --ci` fails), `npx repocanon secrets` lists it masked, and the pre-commit hook blocks the commit. Mark a known false positive with `<!-- repocanon:allow-secret -->` on that line.

**Does it work with ChatGPT?** OpenAI Codex reads `AGENTS.md` natively. ChatGPT in the browser can't see your repo, but `npx repocanon context "your task"` prints a pack you can paste.

**Will it overwrite my `CLAUDE.md` or other rules files?** No. It adds or updates one clearly marked block and leaves the rest of the file alone. Core docs in `.ai/` are only replaced with `init --force`.

**What about monorepos?** Map packages with `moduleRoots` or `modules` today. Per-package knowledge layers are on the [roadmap](https://github.com/awalhadi/repo-canon/blob/main/docs/ROADMAP.md).

**Can I use it as a library?** Yes: `require('repocanon')` exposes the same functions the CLI uses. See [CONTRIBUTING](https://github.com/awalhadi/repo-canon/blob/main/docs/CONTRIBUTING.md).

## Principles

1. Docs are a semantic index, never a code copy. Code wins on conflict.
2. Progressive disclosure: AGENTS.md → PROJECT → INDEX → one module → code.
3. Invariants and business rules over implementation detail.
4. Freshness is computed from git, not promised.
5. Zero dependencies, Node.js 18+.

## Roadmap and contributing

- What's done and what's next: [docs/ROADMAP.md](https://github.com/awalhadi/repo-canon/blob/main/docs/ROADMAP.md)
- Design and threat model: [docs/ARCHITECTURE.md](https://github.com/awalhadi/repo-canon/blob/main/docs/ARCHITECTURE.md)
- Running from source, project layout, tests: [docs/CONTRIBUTING.md](https://github.com/awalhadi/repo-canon/blob/main/docs/CONTRIBUTING.md)
- Bugs and ideas: [GitHub issues](https://github.com/awalhadi/repo-canon/issues)

## Sponsors

**[Framimo](https://framimo.com)** — turn any clip into GIF, WebP, AVIF or MP4, right in your browser. Trim, crop, resize and compress animations; files are processed on your device.

Want to sponsor RepoCanon? [Open an issue](https://github.com/awalhadi/repo-canon/issues).

## License

[MIT](LICENSE) © Md. A Awal Hadi
