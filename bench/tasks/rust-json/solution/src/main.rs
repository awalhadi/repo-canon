use std::collections::HashMap;
use std::process::ExitCode;

use notes::cli::{parse_args, Command, Format};
use notes::error::AppError;
use notes::{config, notes as store, output};

fn run() -> Result<String, AppError> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let env: HashMap<String, String> = std::env::vars().collect();
    let file_text = std::fs::read_to_string("notes.conf").ok();
    let config = config::load(&env, file_text.as_deref())?;
    let text = std::fs::read_to_string(&config.data_file).map_err(|e| AppError::NotFound(format!("{}: {e}", config.data_file)))?;
    let all = store::parse(&text);
    match parse_args(&args)? {
        Command::List { tag, format } => {
            let tag = tag.or(config.default_tag);
            let shown = store::filter(&all, tag.as_deref());
            Ok(match format {
                Format::Text => output::render_text(&shown),
                Format::Json => output::render_json(&shown),
            })
        }
    }
}

fn main() -> ExitCode {
    match run() {
        Ok(out) => {
            println!("{out}");
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("{e}");
            ExitCode::FAILURE
        }
    }
}
