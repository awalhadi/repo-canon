Scripts need machine-readable output from `notes list`.

- Add `--format text|json` to `notes list` (text stays the default). Represent it as `cli::Format { Text, Json }` and a `format` field on `Command::List`.
- Add `output::render_json(notes: &[&Note]) -> String` and use it for `--format json`.
- Keep `cargo test --offline` green and add tests for the new behaviour.
