# {{name}} — AI Guide
Stack: {{stack}}
{{commands}}
{{digest}}
## More detail, only when you need it
Any project rules above apply to every change. For the code you're changing, its module doc (`.ai/modules/<module>.md`) has that area's own rules.
{{docs}}

## Rules
- If a doc and the code disagree, the code wins.
- Never write a guess into a doc; write `TODO: verify`.

## After a change
Only if you changed a rule, a flow or a decision: update that line in the module doc, or record the decision with `rc_propose_adr`. Routine changes need no doc edits.
