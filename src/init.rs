// use chrono::Utc;
use log::info;
use mongodb::bson::doc;
use mongodb::Database;

use crate::auth::hash_password;
use crate::models::user::{User, UserRole};

pub async fn init_admin_user(db: &Database) -> Result<(), mongodb::error::Error> {
    let collection = db.collection::<User>("users");
    
    // 从环境变量获取管理员用户名和密码
    let admin_username = std::env::var("ADMIN_USERNAME").unwrap_or_else(|_| "admin".to_string());
    let admin_password = std::env::var("ADMIN_PASSWORD").unwrap_or_else(|_| "admin123".to_string());
    
    // 检查管理员用户是否存在
    let filter = doc! { "username": &admin_username };
    match collection.find_one(filter, None).await? {
        Some(_) => {
            info!("Admin user '{}' already exists", admin_username);
            Ok(())
        }
        None => {
            // 创建新的管理员用户，使用 UserRole::Admin 而不是 "ADMIN"
            let password_hash = hash_password(&admin_password).expect("Failed to hash password");
            
            let admin = User::new(
                admin_username.clone(),
                password_hash,
                None,
                UserRole::Admin  // 使用枚举变体而不是字符串
            );
            
            collection.insert_one(&admin, None).await?;
            info!("Admin user '{}' created successfully", admin_username);
            Ok(())
        }
    }
} 