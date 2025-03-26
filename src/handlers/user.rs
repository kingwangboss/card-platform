use actix_web::{web, HttpResponse, Scope};
use chrono::Utc;
use mongodb::bson::{self, doc, oid::ObjectId, DateTime as BsonDateTime};
use log::{info, warn, error};

use crate::{
    auth::{generate_token, hash_password, require_admin, verify_password, AuthenticatedUser},
    models::user::{CreateUserRequest, LoginRequest, LoginResponse, UpdateUserRequest, User, UserInfo},
    AppState,
};

pub fn config() -> Scope {
    web::scope("/api/users")
        .route("/register", web::post().to(register_user))
        .route("/login", web::post().to(login))
        .route("/me", web::get().to(get_current_user))
        .route("/current", web::get().to(get_current_user))
        .route("", web::get().to(get_all_users))
        .route("/{id}", web::get().to(get_user))
        .route("/{id}", web::put().to(update_user))
        .route("/{id}", web::delete().to(delete_user))
}

async fn register_user(
    state: web::Data<AppState>,
    req: web::Json<CreateUserRequest>,
) -> HttpResponse {
    info!("Attempting to register new user. Request params: username={}, role={:?}, has_email={}", 
        req.username, req.role, req.email.is_some());
    
    let collection = state.db.collection::<User>("users");

    // Check if username already exists
    let filter = doc! { "username": &req.username };
    match collection.find_one(filter, None).await {
        Ok(Some(_)) => {
            warn!("Username '{}' already exists", req.username);
            return HttpResponse::BadRequest().body("Username already exists");
        }
        Ok(None) => {}
        Err(e) => {
            error!("Database error while checking username: {}", e);
            return HttpResponse::InternalServerError().body(e.to_string());
        }
    }

    // Hash password
    let password_hash = match hash_password(&req.password) {
        Ok(hash) => hash,
        Err(e) => {
            error!("Failed to hash password: {}", e);
            return HttpResponse::InternalServerError().body(e.to_string());
        }
    };

    let user = User::new(
        req.username.clone(),
        password_hash,
        req.email.clone(),
        req.role.clone(),
    );

    match collection.insert_one(&user, None).await {
        Ok(result) => {
            let mut created_user = user;
            created_user.id = Some(result.inserted_id.as_object_id().unwrap());
            let user_info = UserInfo::from(created_user);
            info!("User '{}' registered successfully", req.username);
            HttpResponse::Created().json(user_info)
        }
        Err(e) => {
            error!("Failed to create user '{}': {}", req.username, e);
            HttpResponse::InternalServerError().body(e.to_string())
        }
    }
}

async fn login(state: web::Data<AppState>, req: web::Json<LoginRequest>) -> HttpResponse {
    info!("Login attempt for user: {}", req.username);
    
    let collection = state.db.collection::<User>("users");

    // Find user by username
    let filter = doc! { "username": &req.username };
    match collection.find_one(filter, None).await {
        Ok(Some(user)) => {
            // Verify password
            match verify_password(&req.password, &user.password_hash) {
                Ok(true) => {
                    // Generate JWT token
                    match generate_token(&user) {
                        Ok(token) => {
                            let user_info = UserInfo::from(user.clone());
                            info!("User '{}' logged in successfully", req.username);
                            HttpResponse::Ok().json(LoginResponse {
                                token,
                                user: user_info,
                            })
                        }
                        Err(e) => {
                            error!("Failed to generate token for user '{}': {}", req.username, e);
                            HttpResponse::InternalServerError().body("Failed to generate token")
                        }
                    }
                }
                Ok(false) => {
                    warn!("Invalid password attempt for user '{}'", req.username);
                    HttpResponse::Unauthorized().body("Invalid username or password")
                }
                Err(e) => {
                    error!("Password verification error for user '{}': {}", req.username, e);
                    HttpResponse::InternalServerError().body(e.to_string())
                }
            }
        }
        Ok(None) => {
            warn!("Login attempt with non-existent username: {}", req.username);
            HttpResponse::Unauthorized().body("Invalid username or password")
        }
        Err(e) => {
            error!("Database error during login for user '{}': {}", req.username, e);
            HttpResponse::InternalServerError().body(e.to_string())
        }
    }
}

async fn get_current_user(user: AuthenticatedUser) -> HttpResponse {
    HttpResponse::Ok().json(user)
}

async fn get_all_users(
    state: web::Data<AppState>,
    user: AuthenticatedUser,
) -> HttpResponse {
    match require_admin(user) {
        Ok(_) => {
            let collection = state.db.collection::<User>("users");
            match collection.find(None, None).await {
                Ok(cursor) => {
                    match futures::stream::TryStreamExt::try_collect::<Vec<User>>(cursor).await {
                        Ok(users) => {
                            let user_infos: Vec<UserInfo> = users.into_iter().map(UserInfo::from).collect();
                            HttpResponse::Ok().json(user_infos)
                        }
                        Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
                    }
                }
                Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
            }
        }
        Err(e) => HttpResponse::from_error(e),
    }
}

async fn get_user(
    state: web::Data<AppState>,
    user: AuthenticatedUser,
    path: web::Path<String>,
) -> HttpResponse {
    match require_admin(user) {
        Ok(_) => {
            let id = path.into_inner();
            let object_id = match ObjectId::parse_str(&id) {
                Ok(oid) => oid,
                Err(_) => return HttpResponse::BadRequest().body("Invalid ID format"),
            };

            let collection = state.db.collection::<User>("users");
            let filter = doc! { "_id": object_id };

            match collection.find_one(filter, None).await {
                Ok(Some(user)) => {
                    let user_info = UserInfo::from(user);
                    HttpResponse::Ok().json(user_info)
                }
                Ok(None) => HttpResponse::NotFound().body("User not found"),
                Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
            }
        }
        Err(e) => HttpResponse::from_error(e),
    }
}

async fn update_user(
    state: web::Data<AppState>,
    user: AuthenticatedUser,
    path: web::Path<String>,
    req: web::Json<UpdateUserRequest>,
) -> HttpResponse {
    let user_id = path.into_inner();
    info!("User '{}' attempting to update user {}. Request params: has_password={}, has_email={}, role={:?}", 
        user.username, user_id, req.password.is_some(), req.email.is_some(), req.role);
    
    match require_admin(user) {
        Ok(_) => {
            let object_id = match ObjectId::parse_str(&user_id) {
                Ok(oid) => oid,
                Err(_) => return HttpResponse::BadRequest().body("Invalid ID format"),
            };

            let collection = state.db.collection::<User>("users");
            let filter = doc! { "_id": object_id };

            let now = Utc::now();
            let now_str = now.to_rfc3339();

            // Build update document
            let mut update_doc = doc! {
                "updated_at_str": now_str
            };

            if let Some(username) = &req.username {
                update_doc.insert("username", username);
            }

            if let Some(email) = &req.email {
                update_doc.insert("email", email);
            }

            if let Some(role) = &req.role {
                update_doc.insert("role", bson::to_bson(role).unwrap());
            }

            if let Some(password) = &req.password {
                match hash_password(password) {
                    Ok(hash) => {
                        update_doc.insert("password_hash", hash);
                    }
                    Err(e) => return HttpResponse::InternalServerError().body(e.to_string()),
                }
            }

            let update = doc! { "$set": update_doc };

            match collection.update_one(filter, update, None).await {
                Ok(result) => {
                    if result.matched_count == 0 {
                        HttpResponse::NotFound().body("User not found")
                    } else {
                        HttpResponse::Ok().body("User updated successfully")
                    }
                }
                Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
            }
        }
        Err(e) => HttpResponse::from_error(e),
    }
}

async fn delete_user(
    state: web::Data<AppState>,
    user: AuthenticatedUser,
    path: web::Path<String>,
) -> HttpResponse {
    let user_id = path.into_inner();
    info!("User '{}' attempting to delete user with id: {}", user.username, user_id);
    
    match require_admin(user) {
        Ok(_) => {
            let object_id = match ObjectId::parse_str(&user_id) {
                Ok(oid) => oid,
                Err(_) => return HttpResponse::BadRequest().body("Invalid ID format"),
            };

            let collection = state.db.collection::<User>("users");
            let filter = doc! { "_id": object_id };

            match collection.delete_one(filter, None).await {
                Ok(result) => {
                    if result.deleted_count == 0 {
                        HttpResponse::NotFound().body("User not found")
                    } else {
                        HttpResponse::Ok().body("User deleted successfully")
                    }
                }
                Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
            }
        }
        Err(e) => HttpResponse::from_error(e),
    }
} 