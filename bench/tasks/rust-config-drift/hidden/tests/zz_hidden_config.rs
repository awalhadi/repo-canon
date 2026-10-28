use std::collections::HashMap;
use std::process::Command as Process;

use notes::config::load;
use notes::error::AppError;

fn env(pairs: &[(&str, &str)]) -> HashMap<String, String> {
    pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
}

#[test]
fn hidden_default_comes_from_defaults() {
    assert_eq!(load(&env(&[]), None).unwrap().max_results, 50);
}

#[test]
fn hidden_env_beats_file() {
    assert_eq!(load(&env(&[]), Some("max_results = 5")).unwrap().max_results, 5);
    assert_eq!(load(&env(&[("NOTES_MAX_RESULTS", "3")]), Some("max_results = 5")).unwrap().max_results, 3);
}

#[test]
fn hidden_invalid_values_are_config_errors_naming_the_key() {
    for bad in ["max_results = 0", "max_results = lots", "max_results = -2"] {
        match load(&env(&[]), Some(bad)) {
            Err(AppError::Config(message)) => assert!(message.starts_with("max_results"), "{message}"),
            other => panic!("{bad}: expected AppError::Config, got {other:?}"),
        }
    }
}

#[test]
fn hidden_list_prints_at_most_max_results() {
    let dir = std::env::temp_dir().join(format!("notes-max-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let notes: String = (1..=60).map(|i| format!("{i}|Note {i}|\n")).collect();
    std::fs::write(dir.join("notes.txt"), notes).unwrap();
    let run = |extra_env: &[(&str, &str)]| {
        let out = Process::new(env!("CARGO_BIN_EXE_notes")).arg("list").envs(extra_env.iter().copied()).current_dir(&dir).output().unwrap();
        assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
        String::from_utf8_lossy(&out.stdout).lines().filter(|l| l.starts_with('#')).count()
    };
    assert_eq!(run(&[]), 50);
    assert_eq!(run(&[("NOTES_MAX_RESULTS", "4")]), 4);
}
