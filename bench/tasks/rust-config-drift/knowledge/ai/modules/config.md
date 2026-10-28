---
module: config
code_paths: [src/config.rs, src/defaults.rs]
verified_at:
---
# config

## Invariants
- Precedence env `NOTES_<KEY>` > `notes.conf` > default, all inside `load` via `pick`.
- Invalid values: `AppError::Config("<key>: …")`.
- `max_results` defaults to 20, one terminal screen (D-002). <!-- rc: anchor=src/defaults.rs#MAX_RESULTS -->
