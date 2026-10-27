# {{name}} — AI Guide
Stack: {{stack}}
{{commands}}
{{digest}}
## Knowledge layer (.ai/) — read this, not the whole repo
Read order: `.ai/PROJECT.md` → `.ai/INDEX.md` → ONLY the relevant `.ai/modules/<x>.md`.
Then open only the files listed in that module's code map.

By task:
- business rules / states / glossary → `.ai/DOMAIN.md`
- coding style / patterns → `.ai/CONVENTIONS.md`
- why something is built this way → `.ai/DECISIONS.md`
- what is in progress / recent changes → `.ai/STATE.md`

## Rules
- Do NOT scan or summarize the whole repo. Locate code via INDEX.md and module docs.
- Docs are a semantic index, not a code copy. If docs and code conflict, CODE WINS — then fix the doc.
- If a doc does not say, write `TODO: verify` — never guess or document assumptions as facts.
- Never edit: already-run migrations, generated files, lockfiles (unless asked).
- Follow `.ai/CONVENTIONS.md`. Prefer editing existing modules over creating new ones.

## Definition of Done (mandatory after every change)
1. `.ai/STATE.md`: add 1 line (date, what, files). Keep only the last ~10.
2. Behavior/rule changed → update the module doc and `.ai/DOMAIN.md`.
3. Non-obvious choice made → add an entry to `.ai/DECISIONS.md`.
4. New area worked on with no module doc → create `.ai/modules/<name>.md` from `_TEMPLATE.md`.
5. Bump `verified_at` (short git hash) only in docs you actually re-checked.
6. Optional: `npx repocanon sync` lists which docs are stale and why.
