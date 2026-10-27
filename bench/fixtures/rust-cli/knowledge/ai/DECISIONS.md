---
verified_at:
---
# Decisions
> 3–5 lines each. Newest on top.

## D-002 max_results defaults to 20 (2026-09-03)
- Decision: `list` prints at most `max_results` notes, default 20; must be a positive integer.
- Why: one terminal screen.

## D-001 JSON output is an object (2026-08-15)
- Decision: `--format json` prints `{"count": <n>, "notes": [{"id", "title", "tags"}]}`, never a bare array. Escaped by hand (no serde).
- Why: fields can be added without breaking scripts.
