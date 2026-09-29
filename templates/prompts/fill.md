You are filling the `.ai/` project knowledge layer. Goal: a future agent reads ~2–4k tokens and can work correctly WITHOUT scanning the repo.

## Already detected (do NOT re-discover)
Stack: {{stack}}
Run: `{{run}}` | Test: `{{test}}`
Top-level: {{top}}
Modules (slug: code paths):
{{modules}}

## Work order (stop when done; do not explore beyond this)
1. `.ai/PROJECT.md` — purpose, architecture in ≤5 lines, boundaries, external services. Read: README, entry points, config, docker/compose.
2. `.ai/DOMAIN.md` — the MOST valuable file. Find rules the code hides: enums/status constants → state machines; policies/middleware/guards → permission rules; payment/order/subscription services → money rules; tests → asserted invariants. Write rules and invariants, not implementation.
3. `.ai/CONVENTIONS.md` — infer from 4–5 representative files + linter configs. Include "do NOT" patterns.
4. Module docs: from `_TEMPLATE.md` for the 3 most important modules only. Keep the `code_paths` from the list above (fix if wrong).
5. `.ai/STATE.md` — from `git log --oneline -20` and open TODOs. Do not invent progress.

## Rules
- Tables/bullets only; NO code blocks copied from source; use `path:symbol` pointers.
- Line caps: PROJECT ≤150, DOMAIN ≤300, module ≤100.
- Keep the `cf:auto` block in INDEX.md untouched. Do not modify source code.
- Anything you cannot confirm from code, tests or config → write `TODO: verify`. Never guess or state assumptions as facts.
- Finish by listing: what you filled, what remains TODO, and any doc↔code conflict you noticed. Then run `repocanon doctor` and `repocanon stamp`.
