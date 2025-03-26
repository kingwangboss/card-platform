use chrono::{DateTime, Utc};
use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "UPPERCASE")]
pub enum UserRole {
    #[serde(alias = "ADMIN", alias = "Admin")]
    Admin,
    #[serde(alias = "USER", alias = "User")]
    User,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub username: String,
    pub password_hash: String,
    pub email: Option<String>,
    pub role: UserRole,
    pub created_at_str: String,
    pub updated_at_str: String,
    
    #[serde(skip_serializing, skip_deserializing)]
    pub created_at: DateTime<Utc>,
    #[serde(skip_serializing, skip_deserializing)]
    pub updated_at: DateTime<Utc>,
    pub last_token: Option<String>,
}

impl User {
    pub fn new(username: String, password_hash: String, email: Option<String>, role: UserRole) -> Self {
        let now = Utc::now();
        Self {
            id: None,
            username,
            password_hash,
            email,
            role,
            created_at: now,
            updated_at: now,
            created_at_str: now.to_rfc3339(),
            updated_at_str: now.to_rfc3339(),
            last_token: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UserInfo {
    pub id: String,
    pub username: String,
    pub email: Option<String>,
    pub role: UserRole,
}

impl From<User> for UserInfo {
    fn from(user: User) -> Self {
        Self {
            id: user.id.unwrap().to_hex(),
            username: user.username,
            email: user.email,
            role: user.role,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    pub username: String,
    pub password: String,
    pub email: Option<String>,
    pub role: UserRole,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub user: UserInfo,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserRequest {
    pub username: Option<String>,
    pub password: Option<String>,
    pub email: Option<String>,
    pub role: Option<UserRole>,
} 