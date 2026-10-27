use std::fmt;

#[derive(Debug, PartialEq)]
pub enum AppError {
    Config(String),
    InvalidInput(String),
    NotFound(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::Config(m) => write!(f, "config error: {m}"),
            AppError::InvalidInput(m) => write!(f, "invalid input: {m}"),
            AppError::NotFound(m) => write!(f, "not found: {m}"),
        }
    }
}

impl std::error::Error for AppError {}
