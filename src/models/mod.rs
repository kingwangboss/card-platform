pub mod user;
pub use self::user::*;

use chrono::{DateTime, Utc};
use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

// 卡密创建请求
#[derive(Debug, Deserialize)]
pub struct CreateCardRequest {
    pub duration_days: i32,
}

// 卡密激活请求
#[derive(Debug, Deserialize)]
pub struct ActivateCardRequest {
    pub card_number: String,
}

// 卡密验证请求
#[derive(Debug, Deserialize)]
pub struct VerifyCardRequest {
    pub card_number: String,
}

// 卡密模型
#[derive(Debug, Serialize, Deserialize)]
pub struct Card {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,  // 改回使用 id 字段名，但在序列化时重命名为 _id
    pub card_number: String,
    pub duration_days: i32,
    pub is_activated: bool,
    pub activated_at_str: Option<String>,
    pub expires_at_str: Option<String>,
    pub created_at_str: String,
    
    #[serde(skip_serializing, skip_deserializing)]
    pub activated_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing, skip_deserializing)]
    pub expires_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing, skip_deserializing)]
    pub created_at: DateTime<Utc>,
}

impl Card {
    pub fn new(card_number: String, duration_days: i32) -> Self {
        let now = Utc::now();
        Self {
            id: None,  // 使用 id 字段
            card_number,
            duration_days,
            is_activated: false,
            activated_at: None,
            expires_at: None,
            created_at: now,
            activated_at_str: None,
            expires_at_str: None,
            created_at_str: now.to_rfc3339(),
        }
    }
    
    pub fn with_activation(&self, now: DateTime<Utc>) -> Self {
        let expires_at = now + chrono::Duration::days(self.duration_days as i64);
        Self {
            id: self.id,  // 使用 id 字段
            card_number: self.card_number.clone(),
            duration_days: self.duration_days,
            is_activated: true,
            activated_at: Some(now),
            expires_at: Some(expires_at),
            created_at: self.created_at,
            activated_at_str: Some(now.to_rfc3339()),
            expires_at_str: Some(expires_at.to_rfc3339()),
            created_at_str: self.created_at_str.clone(),
        }
    }
} 