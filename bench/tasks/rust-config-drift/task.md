Long note lists scroll off the screen. Add a `max_results` setting that limits how many notes `notes list` prints.

- Add a `max_results: usize` field to `config::Config`, configurable like the other settings.
- `notes list` prints at most `max_results` notes.
- Keep `cargo test --offline` green and add tests for the new behaviour.
