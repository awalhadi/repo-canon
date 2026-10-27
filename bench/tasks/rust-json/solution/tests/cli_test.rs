use std::collections::HashMap;

use notes::cli::{parse_args, Command};
use notes::config;
use notes::notes::{filter, parse};
use notes::output::render_text;

fn args(list: &[&str]) -> Vec<String> {
    list.iter().map(|s| s.to_string()).collect()
}

#[test]
fn env_beats_file_beats_default() {
    let mut env = HashMap::new();
    let cfg = config::load(&env, Some("data_file = a.txt\ndefault_tag = work")).expect("config");
    assert_eq!((cfg.data_file.as_str(), cfg.default_tag.as_deref()), ("a.txt", Some("work")));
    env.insert("NOTES_DATA_FILE".to_string(), "b.txt".to_string());
    assert_eq!(config::load(&env, Some("data_file = a.txt")).expect("config").data_file, "b.txt");
    assert_eq!(config::load(&HashMap::new(), None).expect("config").data_file, "notes.txt");
}

#[test]
fn lists_by_tag() {
    let notes = parse("1|Buy milk|home\n2|Ship release|work,urgent\n");
    assert_eq!(render_text(&filter(&notes, Some("work"))), "#2 Ship release [work, urgent]");
    assert_eq!(parse_args(&args(&["list", "--tag", "home"])).expect("args"), Command::List { tag: Some("home".into()), format: notes::cli::Format::Text });
}
