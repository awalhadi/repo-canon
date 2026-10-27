---
verified_at:
---
# notes (rust-cli)
A small notes CLI. Rust 2021, **no crates** (builds offline).

## Commands
- Test: `cargo test --offline`

## Boundaries
- `main.rs` is thin wiring; parsing in `cli.rs`, settings in `config.rs`, rendering in `output.rs`.
