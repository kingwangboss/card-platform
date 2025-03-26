use actix_web::{
    dev::Payload, error::ErrorUnauthorized, http::header, Error, FromRequest, HttpRequest, web,
};
use bcrypt::{hash, verify, DEFAULT_COST};
use chrono::{Duration, Utc};
use futures::future::Future;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use mongodb::Database;
use mongodb::bson::{doc, oid::ObjectId};
use std::pin::Pin;

use crate::models::user::{User, UserRole};
use crate::AppState;

// JWT 令牌的声明结构
#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,        // 用户ID
    pub username: String,   // 用户名
    pub role: UserRole,     // 用户角色
    pub exp: usize,         // 过期时间戳
}

// 已认证用户的结构体
#[derive(Debug, Serialize)]
pub struct AuthenticatedUser {
    pub user_id: String,    // 用户ID
    pub username: String,   // 用户名
    pub role: UserRole,     // 用户角色
}

// 实现 FromRequest trait，使 AuthenticatedUser 可以作为请求提取器
impl FromRequest for AuthenticatedUser {
    type Error = Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self, Self::Error>>>>;

    fn from_request(req: &HttpRequest, _: &mut Payload) -> Self::Future {
        let req = req.clone();
        let app_state = req.app_data::<web::Data<AppState>>().cloned();
        
        Box::pin(async move {
            // 从请求头中获取 Authorization 头
            let auth_header = req.headers().get(header::AUTHORIZATION);
            if let Some(auth_header) = auth_header {
                if let Ok(auth_str) = auth_header.to_str() {
                    // 检查是否是 Bearer 令牌
                    if auth_str.starts_with("Bearer ") {
                        let token = &auth_str[7..];
                        
                        // 获取应用状态
                        if let Some(state) = app_state {
                            // 验证令牌
                            match validate_token(token, &state.db).await {
                                Ok(claims) => {
                                    return Ok(AuthenticatedUser {
                                        user_id: claims.sub,
                                        username: claims.username,
                                        role: claims.role,
                                    });
                                }
                                Err(e) => {
                                    // 提供更详细的错误信息
                                    return Err(ErrorUnauthorized(format!("Invalid token: {}", e)));
                                }
                            }
                        }
                    }
                }
            }
            // 如果没有有效的令牌，返回未授权错误
            Err(ErrorUnauthorized("Authorization header missing or invalid"))
        })
    }
}

// 密码哈希函数
pub fn hash_password(password: &str) -> Result<String, bcrypt::BcryptError> {
    hash(password, DEFAULT_COST)
}

// 密码验证函数
pub fn verify_password(password: &str, hash: &str) -> Result<bool, bcrypt::BcryptError> {
    verify(password, hash)
}

// 生成 JWT 令牌
pub async fn generate_token(user: &User, db: &Database) -> Result<String, jsonwebtoken::errors::Error> {
    // 从环境变量获取令牌过期时间
    let jwt_expiration_hours = std::env::var("JWT_EXPIRATION_HOURS")
        .unwrap_or_else(|_| "24".to_string())
        .parse::<i64>()
        .unwrap_or(24);
    
    // 计算过期时间戳
    let expiration = Utc::now()
        .checked_add_signed(Duration::hours(jwt_expiration_hours))
        .expect("valid timestamp")
        .timestamp();

    // 创建声明
    let claims = Claims {
        sub: user.id.unwrap().to_hex(),
        username: user.username.clone(),
        role: user.role.clone(),
        exp: expiration as usize,
    };

    // 从环境变量获取密钥
    let secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| "your_jwt_secret".to_string());
    // 编码令牌
    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )?;
    
    // 更新用户的最新令牌
    let collection = db.collection::<User>("users");
    let filter = doc! { "_id": user.id.unwrap() };
    let update = doc! { "$set": { "last_token": &token } };
    
    match collection.update_one(filter, update, None).await {
        Ok(_) => Ok(token),
        Err(e) => {
            log::error!("Failed to update user token: {}", e);
            Ok(token) // 即使更新失败也返回令牌，避免登录失败
        }
    }
}

// 验证 JWT 令牌
pub async fn validate_token(token: &str, db: &Database) -> Result<Claims, jsonwebtoken::errors::Error> {
    let secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| "your_jwt_secret".to_string());
    let validation = Validation::default();
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )?;
    
    // 获取用户ID
    let user_id = &token_data.claims.sub;
    
    // 从数据库中获取用户
    let collection = db.collection::<User>("users");
    let object_id = match ObjectId::parse_str(user_id) {
        Ok(oid) => oid,
        Err(_) => return Err(jsonwebtoken::errors::Error::from(jsonwebtoken::errors::ErrorKind::InvalidToken)),
    };
    
    let filter = doc! { "_id": object_id };
    match collection.find_one(filter, None).await {
        Ok(Some(user)) => {
            // 检查令牌是否是用户的最新令牌
            if let Some(last_token) = &user.last_token {
                if last_token != token {
                    return Err(jsonwebtoken::errors::Error::from(jsonwebtoken::errors::ErrorKind::InvalidToken));
                }
            }
            Ok(token_data.claims)
        },
        _ => Err(jsonwebtoken::errors::Error::from(jsonwebtoken::errors::ErrorKind::InvalidToken)),
    }
}

// 检查用户是否为管理员
pub fn require_admin(user: AuthenticatedUser) -> Result<AuthenticatedUser, Error> {
    if user.role == UserRole::Admin {
        Ok(user)
    } else {
        Err(ErrorUnauthorized("Admin privileges required"))
    }
} 