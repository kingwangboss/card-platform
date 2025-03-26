use serde::{Serialize, Deserialize};

// 注释掉这个结构体，因为我们已经在 mod.rs 中定义了它
// #[derive(Debug, Serialize, Deserialize)]
// pub struct CreateCardRequest {
//     pub duration_days: i32,
//     #[serde(default = "default_count")]
//     pub count: i32,
// }

// fn default_count() -> i32 {
//     1
// }

// 如果需要在这个文件中定义其他卡密相关的结构体，可以在这里添加 