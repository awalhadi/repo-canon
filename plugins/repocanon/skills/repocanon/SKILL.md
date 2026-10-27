---
name: repocanon
description: Use when working in a project that has a RepoCanon knowledge layer (AGENTS.md plus an .ai/ folder) — to get task context before exploring code, to fill or update the .ai/ docs after code changes, or when the user asks to "fill the RepoCanon docs", "update the context docs" or check whether the docs are stale.
---

# Working with a RepoCanon knowledge layer

RepoCanon keeps what the code can't say — rules, invariants, decisions, boundaries, gotchas — in `AGENTS.md` and `.ai/`, and uses git to track whether each doc still matches the code. Code always wins: when a doc disagrees with the code, trust the code and fix the doc.

## Before a task
1. Call the `rc_context` MCP tool with the task description (and the files you expect to touch). It returns the rules plus the most relevant module docs within a token budget.
2. Docs labelled **stale**, **broken** or **unverified** in that result may be out of date. Check them against the code before relying on them.
3. Open only the files a module doc's code map points to. Don't scan the whole repo.

## Filling the docs for the first time
Call `rc_prepare_fill` and follow the brief it returns, writing `.ai/*.md` with your file tools.

## After changing code
1. Call `rc_sync_report` to see which docs your changes affect.
2. Update a doc only where behaviour, rules, flow or ownership changed.
3. Record a non-obvious choice with `rc_propose_adr`, and where work stands with `rc_checkpoint_state` (focus, in progress, known issues, one line for the change). Both refuse secrets and pasted code, and neither marks anything verified.
4. After the code is committed, call `rc_stamp` with only the docs you actually re-checked against the code. It records `verified_by: agent`, so a human can see it.
5. Call `rc_verify` and fix what it reports until it says PASS.

Without MCP, the CLI equivalents are: edit `.ai/STATE.md` / `.ai/DECISIONS.md` by hand, `npx repocanon stamp <doc>…`, and `npx repocanon doctor`.

## Never write into .ai/
- Directory trees, dependency or version lists, file-by-file catalogues — agents read those from the repo.
- Pasted source code — point to it as `path:symbol`.
- Secrets of any kind: API keys, tokens, passwords, connection strings. `doctor` treats them as errors and the pre-commit hook blocks the commit.
- Guesses. If you can't confirm something from code, tests or config, write `TODO: verify`.
