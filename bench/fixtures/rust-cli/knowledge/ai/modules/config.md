---
module: config
code_paths: [src/config.rs]
verified_at:
---
# config

## Invariants
- Precedence env `NOTES_<KEY>` > `notes.conf` > default, all inside `load` via `pick`.
- Invalid values: `AppError::Config("<key>: …")`. `max_results` default 20 (D-002).
