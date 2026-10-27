use crate::error::AppError;

#[derive(Debug, PartialEq)]
pub enum Command {
    List { tag: Option<String> },
}

pub fn parse_args(args: &[String]) -> Result<Command, AppError> {
    let mut iter = args.iter();
    match iter.next().map(String::as_str) {
        Some("list") => {
            let mut tag = None;
            while let Some(arg) = iter.next() {
                match arg.as_str() {
                    "--tag" => tag = Some(iter.next().ok_or_else(|| AppError::InvalidInput("--tag needs a value".into()))?.clone()),
                    other => return Err(AppError::InvalidInput(format!("unknown option {other}"))),
                }
            }
            Ok(Command::List { tag })
        }
        Some(other) => Err(AppError::InvalidInput(format!("unknown command {other}"))),
        None => Err(AppError::InvalidInput("usage: notes list [--tag TAG]".into())),
    }
}
