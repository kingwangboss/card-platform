// 导入模块
mod auth;       // 认证相关模块
mod errors;     // 错误处理模块
mod handlers;   // 请求处理器模块
mod init;       // 初始化模块
mod models;     // 数据模型模块

use actix_cors::Cors;
use actix_files as fs;
use actix_web::{middleware, web, App, HttpServer};
use dotenv::dotenv;
use mongodb::{Client, Database};
use std::env;
use std::fs::create_dir_all;
use log::{info, LevelFilter};
use log4rs::{
    append::file::FileAppender,
    config::{Appender, Config, Root},
    encode::pattern::PatternEncoder,
};

// 应用状态结构体，包含数据库连接
pub struct AppState {
    pub db: Database,
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // 加载环境变量
    dotenv().ok();
    
    // 初始化日志系统
    let log_level = env::var("LOG_LEVEL")
        .unwrap_or_else(|_| "info".to_string())
        .parse::<LevelFilter>()
        .unwrap_or(LevelFilter::Info);
    
    let log_file = env::var("LOG_FILE").unwrap_or_else(|_| "./logs/card-platform.log".to_string());

    // 确保日志目录存在
    if let Some(log_dir) = std::path::Path::new(&log_file).parent() {
        create_dir_all(log_dir)?;
    }

    // 创建文件追加器
    let file_appender = FileAppender::builder()
        .encoder(Box::new(PatternEncoder::new("{d(%Y-%m-%d %H:%M:%S)} {l} - {m}\n")))
        .build(log_file)
        .unwrap();

    // 创建日志配置
    let config = Config::builder()
        .appender(Appender::builder().build("file", Box::new(file_appender)))
        .build(Root::builder().appender("file").build(log_level))
        .unwrap();

    // 初始化日志系统
    log4rs::init_config(config).unwrap();

    info!("Starting card platform service...");

    // 从环境变量获取数据库配置
    let mongodb_uri = env::var("MONGODB_URI").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
    let database_name = env::var("DATABASE_NAME").unwrap_or_else(|_| "card_platform".to_string());

    // 连接到 MongoDB 数据库
    let client = Client::with_uri_str(&mongodb_uri)
        .await
        .expect("Failed to connect to MongoDB");
    let db = client.database(&database_name);

    // 初始化管理员用户
    init::init_admin_user(&db)
        .await
        .expect("Failed to initialize admin user");

    // 创建应用状态
    let app_state = web::Data::new(AppState { db });

    // 从环境变量获取服务器配置
    let host = env::var("SERVER_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port = env::var("SERVER_PORT").unwrap_or_else(|_| "5005".to_string())
        .parse::<u16>()
        .expect("SERVER_PORT must be a number");
    let static_files_path = env::var("STATIC_FILES_PATH").unwrap_or_else(|_| "./static".to_string());

    println!("Server running at http://{}:{}", host, port);

    // 启动 HTTP 服务器
    HttpServer::new(move || {
        // 配置 CORS
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

        // 配置应用
        App::new()
            .wrap(middleware::Logger::default())  // 启用日志中间件
            .wrap(cors)                           // 启用 CORS 中间件
            .app_data(app_state.clone())          // 注入应用状态
            .service(handlers::card::config())    // 注册卡密相关路由
            .service(handlers::user::config())    // 注册用户相关路由
            .service(fs::Files::new("/", &static_files_path).index_file("index.html"))  // 静态文件服务
    })
    .bind(format!("{}:{}", host, port))?
    .run()
    .await
}
