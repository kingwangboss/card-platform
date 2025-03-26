use actix_web::{web, HttpResponse, Scope};
use chrono::{DateTime, Utc};
use log::{info, warn, error};  // 添加日志级别导入
use mongodb::bson::{doc, oid::ObjectId};
use rand::distributions::Alphanumeric;
use rand::Rng;
use crate::{
    auth::AuthenticatedUser,
    models::{Card, CreateCardRequest, ActivateCardRequest, VerifyCardRequest, UserRole},
    AppState,
};

// 配置卡密相关的路由
pub fn config() -> Scope {
    web::scope("/api/cards")
        .route("/generate", web::post().to(generate_card))     // 生成卡密
        .route("/activate", web::post().to(activate_card))     // 激活卡密
        .route("/verify", web::post().to(verify_card))         // 验证卡密
        .route("", web::get().to(get_all_cards))               // 获取所有卡密
        .route("/export", web::get().to(export_cards))         // 导出卡密
        .route("/{id}", web::delete().to(delete_card))         // 删除卡密
}

// 生成卡密处理函数
async fn generate_card(
    state: web::Data<AppState>,
    user: AuthenticatedUser,
    req: web::Json<CreateCardRequest>,
) -> HttpResponse {
    // 使用 .0 或 .into_inner() 访问内部的 CreateCardRequest
    let req_inner = req.into_inner();
    
    info!("User '{}' is generating card. Request params: duration_days={}, count={}", 
        user.username, req_inner.duration_days, req_inner.count);
    
    let card_length = std::env::var("DEFAULT_CARD_LENGTH")
        .unwrap_or_else(|_| "16".to_string())
        .parse::<usize>()
        .unwrap_or(16);
    
    // 限制生成数量在1-100之间
    let count = req_inner.count.max(1).min(100);
    let mut cards = Vec::with_capacity(count as usize);
    
    for _ in 0..count {
        let card_number: String = rand::thread_rng()
            .sample_iter(&Alphanumeric)
            .take(card_length)
            .map(char::from)
            .collect();
        
        // 创建卡密时记录创建者ID
        let mut card = Card::new(card_number.clone(), req_inner.duration_days);
        card.created_by = Some(user.user_id.clone());
        card.created_by_username = Some(user.username.clone());
        
        cards.push(card);
    }
    
    // 批量插入卡密
    match state.db.collection::<Card>("cards")
        .insert_many(&cards, None)
        .await {
            Ok(_) => {
                info!("Generated {} cards successfully by user '{}'", count, user.username);
                HttpResponse::Ok().json(cards)
            },
            Err(e) => {
                error!("Failed to generate cards: {}", e);
                HttpResponse::InternalServerError().body(e.to_string())
            },
        }
}

// 激活卡密处理函数
async fn activate_card(
    state: web::Data<AppState>,
    req: web::Json<ActivateCardRequest>,
) -> HttpResponse {
    info!("Attempting to activate card. Request params: card_number={}", req.card_number);
    
    let collection = state.db.collection::<Card>("cards");
    let card_filter = doc! { "card_number": &req.card_number };

    match collection.find_one(card_filter, None).await {
        Ok(Some(card)) => {
            if card.is_activated {
                warn!("Card '{}' is already activated", req.card_number);
                return HttpResponse::BadRequest().json(serde_json::json!({
                    "error": "Card already activated",
                    "message": "This card has already been activated",
                    "card": card
                }));
            }

            let filter = doc! {
                "card_number": &req.card_number,
                "is_activated": false,
            };

            let now = Utc::now();
            let updated_card = card.with_activation(now);
            
            let update = doc! {
                "$set": {
                    "is_activated": true,
                    "activated_at_str": updated_card.activated_at_str,
                    "expires_at_str": updated_card.expires_at_str,
                }
            };

            match collection.update_one(filter, update, None).await {
                Ok(update_result) => {
                    if update_result.modified_count == 0 {
                        warn!("Card '{}' could not be activated, may have been activated by another request", req.card_number);
                        return HttpResponse::BadRequest().body("Card could not be activated, it may have been activated by another request");
                    }
                    
                    match collection.find_one(doc! { "card_number": &req.card_number }, None).await {
                        Ok(Some(card)) => {
                            info!("Card '{}' activated successfully", req.card_number);
                            HttpResponse::Ok().json(card)
                        },
                        Ok(None) => {
                            error!("Card '{}' not found after update", req.card_number);
                            HttpResponse::NotFound().body("Card not found after update")
                        },
                        Err(e) => {
                            error!("Error fetching updated card '{}': {}", req.card_number, e);
                            HttpResponse::InternalServerError().body(e.to_string())
                        },
                    }
                },
                Err(e) => {
                    error!("Error activating card '{}': {}", req.card_number, e);
                    HttpResponse::InternalServerError().body(e.to_string())
                },
            }
        },
        Ok(None) => {
            warn!("Card '{}' not found", req.card_number);
            HttpResponse::NotFound().body("Card not found")
        },
        Err(e) => {
            error!("Error finding card '{}': {}", req.card_number, e);
            HttpResponse::InternalServerError().body(e.to_string())
        },
    }
}

// 验证卡密处理函数
async fn verify_card(
    state: web::Data<AppState>,
    req: web::Json<VerifyCardRequest>,
) -> HttpResponse {
    info!("Attempting to verify card. Request params: card_number={}", req.card_number);
    
    let collection = state.db.collection::<Card>("cards");

    // 首先检查卡密是否存在
    let filter = doc! {
        "card_number": &req.card_number,
    };

    match collection.find_one(filter, None).await {
        Ok(Some(card)) => {
            // 如果卡密未激活，自动激活它
            if !card.is_activated {
                // 卡密存在且未激活，进行激活
                let filter = doc! {
                    "card_number": &req.card_number,
                    "is_activated": false,
                };

                let now = Utc::now();
                let updated_card = card.with_activation(now);
                
                // 更新数据库中的卡密状态
                let update = doc! {
                    "$set": {
                        "is_activated": true,
                        "activated_at_str": updated_card.activated_at_str,
                        "expires_at_str": updated_card.expires_at_str,
                    }
                };

                match collection.update_one(filter, update, None).await {
                    Ok(update_result) => {
                        if update_result.modified_count == 0 {
                            // 如果没有文档被修改，可能是因为卡密在检查和更新之间被其他请求激活了
                            return HttpResponse::BadRequest().body("Card could not be activated, it may have been activated by another request");
                        }
                        
                        // 获取更新后的卡密信息
                        let updated_filter = doc! {
                            "card_number": &req.card_number,
                        };
                        
                        match collection.find_one(updated_filter, None).await {
                            Ok(Some(updated_card)) => {
                                // 解析日期时间字符串
                                if let Some(expires_at_str) = &updated_card.expires_at_str {
                                    if let Ok(expires_at) = expires_at_str.parse::<DateTime<Utc>>() {
                                        let mut card_with_dates = updated_card;
                                        card_with_dates.expires_at = Some(expires_at);
                                        
                                        return HttpResponse::Ok().json(serde_json::json!({
                                            "message": "Card activated successfully",
                                            "card": card_with_dates
                                        }));
                                    }
                                }
                                
                                return HttpResponse::Ok().json(serde_json::json!({
                                    "message": "Card activated successfully",
                                    "card": updated_card
                                }));
                            },
                            Ok(None) => return HttpResponse::NotFound().body("Card not found after update"),
                            Err(e) => return HttpResponse::InternalServerError().body(e.to_string()),
                        }
                    },
                    Err(e) => return HttpResponse::InternalServerError().body(e.to_string()),
                }
            }

            // 卡密已激活，检查是否过期
            if let Some(expires_at_str) = &card.expires_at_str {
                if let Ok(expires_at) = expires_at_str.parse::<DateTime<Utc>>() {
                    let mut card_with_dates = card;
                    card_with_dates.expires_at = Some(expires_at);
                    
                    // 检查是否过期
                    if expires_at > Utc::now() {
                        return HttpResponse::Ok().json(card_with_dates);
                    } else {
                        return HttpResponse::BadRequest().json(serde_json::json!({
                            "error": "Card expired",
                            "message": "This card has expired",
                            "card": card_with_dates
                        }));
                    }
                }
            }
            
            return HttpResponse::BadRequest().body("Invalid expiration date");
        },
        Ok(None) => HttpResponse::NotFound().body("Card not found"),
        Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
    }
}

// 获取所有卡密处理函数
async fn get_all_cards(
    state: web::Data<AppState>,
    user: AuthenticatedUser,
) -> HttpResponse {
    info!("User '{}' is fetching cards", user.username);
    
    let collection = state.db.collection::<Card>("cards");
    
    // 根据用户角色决定查询条件
    let filter = match user.role {
        UserRole::Admin => None, // 管理员可以查看所有卡密
        _ => Some(doc! { "created_by": &user.user_id }), // 普通用户只能查看自己的卡密
    };
    
    // 查询卡密
    match collection.find(filter, None).await {
        Ok(cursor) => {
            match futures::stream::TryStreamExt::try_collect::<Vec<Card>>(cursor).await {
                Ok(cards) => HttpResponse::Ok().json(cards),
                Err(e) => {
                    error!("Error collecting cards: {}", e);
                    HttpResponse::InternalServerError().body(e.to_string())
                },
            }
        }
        Err(e) => {
            error!("Error finding cards: {}", e);
            HttpResponse::InternalServerError().body(e.to_string())
        },
    }
}

// 删除卡密处理函数
async fn delete_card(
    state: web::Data<AppState>,
    user: AuthenticatedUser,
    path: web::Path<String>,
) -> HttpResponse {
    let id = path.into_inner();
    info!("User '{}' attempting to delete card. Request params: id={}", user.username, id);

    let object_id = match ObjectId::parse_str(&id) {
        Ok(oid) => oid,
        Err(e) => {
            warn!("Invalid card ID format: {}", e);
            return HttpResponse::BadRequest().body(format!("Invalid ID format: {}", e));
        }
    };

    let collection = state.db.collection::<Card>("cards");
    
    // 根据用户角色决定删除条件
    let filter = match user.role {
        UserRole::Admin => doc! { "_id": object_id }, // 管理员可以删除任何卡密
        _ => doc! { "_id": object_id, "created_by": &user.user_id }, // 普通用户只能删除自己的卡密
    };

    match collection.delete_one(filter, None).await {
        Ok(result) => {
            if result.deleted_count == 0 {
                warn!("Card with ID '{}' not found for deletion or user lacks permission", id);
                HttpResponse::NotFound().body("Card not found or you don't have permission to delete it")
            } else {
                info!("Card with ID '{}' deleted successfully by user '{}'", id, user.username);
                HttpResponse::Ok().body("Card deleted successfully")
            }
        }
        Err(e) => {
            error!("Error deleting card '{}': {}", id, e);
            HttpResponse::InternalServerError().body(e.to_string())
        }
    }
}

// 导出卡密处理函数
async fn export_cards(
    state: web::Data<AppState>,
    user: AuthenticatedUser,
) -> HttpResponse {
    info!("User '{}' is exporting all cards", user.username);
    
    let collection = state.db.collection::<Card>("cards");
    
    // 查询所有卡密
    match collection.find(None, None).await {
        Ok(cursor) => {
            match futures::stream::TryStreamExt::try_collect::<Vec<Card>>(cursor).await {
                Ok(cards) => {
                    // 构建 CSV 内容
                    let mut csv_content = String::from("卡号,有效期(天),状态,激活时间,过期时间,创建时间\n");
                    
                    // 遍历卡密生成 CSV 行
                    for card in cards {
                        let status = if card.is_activated { "已激活" } else { "未激活" };
                        let activated_at = card.activated_at_str.unwrap_or_else(|| "-".to_string());
                        let expires_at = card.expires_at_str.unwrap_or_else(|| "-".to_string());
                        
                        csv_content.push_str(&format!(
                            "{},{},{},{},{},{}\n",
                            card.card_number,
                            card.duration_days,
                            status,
                            activated_at,
                            expires_at,
                            card.created_at_str
                        ));
                    }
                    
                    // 设置响应头，使浏览器下载文件
                    HttpResponse::Ok()
                        .insert_header(("Content-Type", "text/csv; charset=utf-8"))
                        .insert_header(("Content-Disposition", "attachment; filename=\"cards.csv\""))
                        .body(csv_content)
                },
                Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
            }
        }
        Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
    }
} 