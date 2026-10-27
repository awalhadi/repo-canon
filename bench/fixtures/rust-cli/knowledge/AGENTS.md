# AGENTS.md — rust-cli (`notes`)

A small notes CLI. Rust 2021, **no crates** (builds offline) — write helpers yourself.

## Commands
- Test: `cargo test --offline`

## Layout
```
src/
  main.rs     thin: load config, parse args, print
  cli.rs      argument parsing → Command
  config.rs   settings (defaults, notes.conf, NOTES_* env)
  notes.rs    note parsing and filtering
  output.rs   rendering
  error.rs    AppError
tests/
```

## Rules
- No `unwrap()`, `expect()` or `panic!` in `src/` — return `AppError`. Tests may unwrap.
- Settings: every key is resolved in `config::load` with precedence **env `NOTES_<KEY>` > `notes.conf` > default**. An invalid value is `AppError::Config` whose message starts with the key name (`"max_results: …"`).
- Bad command-line input is `AppError::InvalidInput`. Options live on the `Command` variant.
- Rendering lives in `output.rs`; `main.rs` only wires things together.

## Decisions
- Machine-readable output (`--format json`) is always an object: `{"count": <number of notes>, "notes": [{"id", "title", "tags"}]}` — never a bare array, so we can add fields without breaking scripts. JSON is escaped by hand (no serde).
- `max_results` (how many notes `list` prints) defaults to **20**, one terminal screen. It must be a positive integer.
