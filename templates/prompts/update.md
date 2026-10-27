Sync `.ai/` docs with recent code changes.

1. Run `npx repocanon sync --write`, then read `.ai/.sync-report.md` (docs to update, signals, unmapped files).
2. For each listed module run the `inspect:` git diff command from the report (targeted — never scan the whole repo).
3. Update only what changed in behavior, rules, flow or code map. Code wins over docs. Fix `code_paths` for broken modules. Never add directory trees, dependency lists or pasted code — agents read those from the repo.
4. Add a 1-line entry to STATE.md; DECISIONS.md only for non-obvious choices. Unsure → `TODO: verify`, never guess.
5. Run `npx repocanon rules` so per-module rule files (Cursor, Copilot) carry the new text.
6. After the code is committed, run `npx repocanon stamp <module>` for each doc you re-checked.
