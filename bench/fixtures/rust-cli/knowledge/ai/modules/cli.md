---
module: cli
code_paths: [src/cli.rs, src/output.rs, src/main.rs]
verified_at:
---
# cli

## Purpose
Argument parsing, rendering and the binary's wiring.

## Invariants
- `parse_args` returns `Command` variants carrying their options; bad input is `AppError::InvalidInput`.
- JSON output is `{"count", "notes"}` (D-001).
