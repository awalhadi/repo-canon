---
verified_at:
---
# Conventions

- No `unwrap()`, `expect()` or `panic!` in `src/` — return `AppError`. Tests may unwrap.
- Settings resolve in `config::load`: **env `NOTES_<KEY>` > `notes.conf` > default**. Invalid value → `AppError::Config` with a message starting with the key name (`"max_results: …"`).
- Bad command-line input is `AppError::InvalidInput`; options live on the `Command` variant.
