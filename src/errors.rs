use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("MongoDB error: {0}")]
    MongoError(#[from] mongodb::error::Error),

    #[error("Card not found")]
    NotFound,

    #[error("Card already activated")]
    AlreadyActivated,

    #[error("Card expired")]
    Expired,
} 