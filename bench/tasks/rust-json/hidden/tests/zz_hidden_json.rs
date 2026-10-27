use std::io::Write;
use std::process::{Command as Process, Stdio};

use notes::cli::{parse_args, Command, Format};
use notes::error::AppError;
use notes::notes::Note;
use notes::output::render_json;

fn args(list: &[&str]) -> Vec<String> {
    list.iter().map(|s| s.to_string()).collect()
}

/// Asserts with Python's json module, so field order and whitespace don't matter.
fn assert_json(text: &str, expected_python: &str) {
    let script = format!("import json,sys; d=json.load(sys.stdin); assert d == {expected_python}, d");
    let mut child = Process::new("python3").args(["-c", &script]).stdin(Stdio::piped()).stderr(Stdio::piped()).spawn().unwrap();
    child.stdin.take().unwrap().write_all(text.as_bytes()).unwrap();
    let out = child.wait_with_output().unwrap();
    assert!(out.status.success(), "not the expected JSON: {text}\n{}", String::from_utf8_lossy(&out.stderr));
}

#[test]
fn hidden_parses_format() {
    assert_eq!(parse_args(&args(&["list", "--format", "json"])).unwrap(), Command::List { tag: None, format: Format::Json });
    assert_eq!(parse_args(&args(&["list", "--tag", "a"])).unwrap(), Command::List { tag: Some("a".into()), format: Format::Text });
    assert!(matches!(parse_args(&args(&["list", "--format", "xml"])), Err(AppError::InvalidInput(_))));
}

#[test]
fn hidden_json_is_an_object_with_count_and_escapes() {
    let note = Note { id: 7, title: "Say \"hi\"\\now\n".into(), tags: vec!["a".into()] };
    assert_json(&render_json(&[&note]), r#"{"count": 1, "notes": [{"id": 7, "title": "Say \"hi\"\\now\n", "tags": ["a"]}]}"#);
    assert_json(&render_json(&[]), r#"{"count": 0, "notes": []}"#);
}

#[test]
fn hidden_binary_prints_json() {
    let dir = std::env::temp_dir().join(format!("notes-json-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("notes.txt"), "1|Buy milk|home\n2|Ship|work\n").unwrap();
    let out = Process::new(env!("CARGO_BIN_EXE_notes")).args(["list", "--format", "json", "--tag", "work"]).current_dir(&dir).output().unwrap();
    assert!(out.status.success());
    assert_json(&String::from_utf8_lossy(&out.stdout), r#"{"count": 1, "notes": [{"id": 2, "title": "Ship", "tags": ["work"]}]}"#);
}
