use std::collections::HashMap;

use crate::error::AppError;

#[derive(Debug, Clone, PartialEq)]
pub struct Config {
    pub data_file: String,
    pub default_tag: Option<String>,
}

impl Default for Config {
    fn default() -> Self {
        Config { data_file: "notes.txt".to_string(), default_tag: None }
    }
}

/// Parses `key = value` lines; `#` starts a comment.
fn parse_file(text: &str) -> Result<HashMap<String, String>, AppError> {
    let mut values = HashMap::new();
    for (number, raw) in text.lines().enumerate() {
        let line = raw.split('#').next().unwrap_or("").trim();
        if line.is_empty() {
            continue;
        }
        let (key, value) = line
            .split_once('=')
            .ok_or_else(|| AppError::Config(format!("line {}: expected key = value", number + 1)))?;
        values.insert(key.trim().to_string(), value.trim().trim_matches('"').to_string());
    }
    Ok(values)
}

/// Builds the config from defaults, then the config file, then `NOTES_*` environment variables.
pub fn load(env: &HashMap<String, String>, file_text: Option<&str>) -> Result<Config, AppError> {
    let file = match file_text {
        Some(text) => parse_file(text)?,
        None => HashMap::new(),
    };
    let pick = |key: &str| env.get(&format!("NOTES_{}", key.to_uppercase())).or_else(|| file.get(key)).cloned();

    let mut config = Config::default();
    if let Some(data_file) = pick("data_file") {
        config.data_file = data_file;
    }
    config.default_tag = pick("default_tag").filter(|t| !t.is_empty());
    Ok(config)
}
