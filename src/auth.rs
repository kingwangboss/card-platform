use actix_web::{
    dev::Payload, error::ErrorUnauthorized, http::header, Error, FromRequest, HttpRequest,
};
use bcrypt::{hash, verify, DEFAULT_COST};
use chrono::{Duration, Utc};
use futures::future::{ready, Ready};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

use crate::models::user::{User, UserRole};

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
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, _: &mut Payload) -> Self::Future {
        // 从请求头中获取 Authorization 头
        let auth_header = req.headers().get(header::AUTHORIZATION);
        if let Some(auth_header) = auth_header {
            if let Ok(auth_str) = auth_header.to_str() {
                // 检查是否是 Bearer 令牌
                if auth_str.starts_with("Bearer ") {
                    let token = &auth_str[7..];
                    // 验证令牌
                    match validate_token(token) {
                        Ok(claims) => {
                            return ready(Ok(AuthenticatedUser {
                                user_id: claims.sub,
                                username: claims.username,
                                role: claims.role,
                            }));
                        }
                        Err(e) => {
                            // 提供更详细的错误信息
                            return ready(Err(ErrorUnauthorized(format!("Invalid token: {}", e))));
                        }
                    }
                }
            }
        }
        // 如果没有有效的令牌，返回未授权错误
        ready(Err(ErrorUnauthorized("Authorization header missing or invalid")))
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
pub fn generate_token(user: &User) -> Result<String, jsonwebtoken::errors::Error> {
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
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
}

// 验证 JWT 令牌
pub fn validate_token(token: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
    let secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| "your_jwt_secret".to_string());
    let validation = Validation::default();
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )?;
    Ok(token_data.claims)
}

// 检查用户是否为管理员
pub fn require_admin(user: AuthenticatedUser) -> Result<AuthenticatedUser, Error> {
    if user.role == UserRole::Admin {
        Ok(user)
    } else {
        Err(ErrorUnauthorized("Admin privileges required"))
    }
} 