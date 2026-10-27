use crate::error::AppError;

#[derive(Debug, PartialEq, Clone, Copy)]
pub enum Format {
    Text,
    Json,
}

#[derive(Debug, PartialEq)]
pub enum Command {
    List { tag: Option<String>, format: Format },
}

pub fn parse_args(args: &[String]) -> Result<Command, AppError> {
    let mut iter = args.iter();
    match iter.next().map(String::as_str) {
        Some("list") => {
            let mut tag = None;
            let mut format = Format::Text;
            while let Some(arg) = iter.next() {
                let mut value = |name: &str| iter.next().cloned().ok_or_else(|| AppError::InvalidInput(format!("{name} needs a value")));
                match arg.as_str() {
                    "--tag" => tag = Some(value("--tag")?),
                    "--format" => {
                        format = match value("--format")?.as_str() {
                            "text" => Format::Text,
                            "json" => Format::Json,
                            other => return Err(AppError::InvalidInput(format!("unknown format {other}"))),
                        }
                    }
                    other => return Err(AppError::InvalidInput(format!("unknown option {other}"))),
                }
            }
            Ok(Command::List { tag, format })
        }
        Some(other) => Err(AppError::InvalidInput(format!("unknown command {other}"))),
        None => Err(AppError::InvalidInput("usage: notes list [--tag TAG] [--format text|json]".into())),
    }
}
