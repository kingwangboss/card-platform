# 卡密管理系统

一个基于 Rust + Actix-web + MongoDB 的卡密管理系统，提供卡密的生成、验证、管理等功能。

## 功能特点

- 🔐 用户认证与权限管理
- 🎫 卡密生成与管理
- ✅ 卡密验证与激活
- 📊 数据导出功能
- 📝 详细的操作日志
- 🌐 RESTful API
- 💻 现代化的 Web 界面
- 🐳 Docker 支持

## 技术栈

### 后端
- Rust
- Actix-web (Web 框架)
- MongoDB (数据库)
- JWT (认证)
- log4rs (日志系统)

### 前端
- Vue.js 3
- Bootstrap 5
- Axios

## 部署方式

### 方式一：Docker Compose（推荐）

1. 确保已安装 Docker 和 Docker Compose
```bash
# 检查 Docker 版本
docker --version

# 检查 Docker Compose 版本
docker compose version
```

2. 克隆项目
```bash
git clone https://github.com/kingwangboss/card-platform.git
cd card-platform
```

3. 配置环境变量
```bash
# 复制并编辑 Docker 环境配置文件
cp .env.docker.example .env.docker
vim .env.docker
```

4. 启动服务
```bash
# 构建并启动所有服务
docker compose up -d

# 查看日志
docker compose logs -f

# 查看服务状态
docker compose ps
```

5. 停止服务
```bash
docker compose down
```

6. 更新部署
```bash
# 拉取最新代码
git pull

# 重新构建并启动
docker compose build
docker compose up -d
```

7. 数据备份
```bash
# 备份 MongoDB 数据
docker exec -it card-platform_mongodb_1 mongodump --out /data/backup

# 从主机复制备份文件
docker cp card-platform_mongodb_1:/data/backup ./backup
```

### 方式二：手动部署

1. 安装依赖
```bash
# 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 安装 MongoDB
# 根据您的操作系统选择适当的安装方法
```

2. 配置环境
```bash
# 复制环境配置模板
cp .env.example .env

# 修改配置
vim .env
```

3. 构建和运行
```bash
# 构建项目
cargo build --release

# 运行服务
./target/release/card-platform
```

4. 使用 systemd 服务（可选）
```bash
# 创建服务文件
sudo vim /etc/systemd/system/card-platform.service
```

```ini
[Unit]
Description=Card Platform Service
After=network.target

[Service]
Type=simple
User=card-platform
WorkingDirectory=/opt/card-platform
Environment=RUST_LOG=info
ExecStart=/opt/card-platform/target/release/card-platform
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
# 启动服务
sudo systemctl enable card-platform
sudo systemctl start card-platform

# 查看状态
sudo systemctl status card-platform

# 查看日志
sudo journalctl -u card-platform -f
```

## 项目结构

```
card-platform/
├── src/
│   ├── handlers/           # 请求处理器
│   │   ├── card.rs        # 卡密相关处理
│   │   ├── user.rs        # 用户相关处理
│   │   └── mod.rs
│   ├── models/            # 数据模型
│   │   ├── user.rs        # 用户模型
│   │   └── mod.rs         # 卡密模型
│   ├── auth.rs            # 认证相关
│   ├── errors.rs          # 错误处理
│   ├── init.rs            # 初始化
│   └── main.rs            # 主程序入口
├── static/                # 静态文件
│   ├── index.html        # 主页面
│   ├── styles.css        # 样式表
│   └── app.js            # 前端逻辑
├── logs/                  # 日志目录
│   └── card-platform.log  # 日志文件
├── docker/               # Docker 相关文件
│   ├── Dockerfile       # Docker 构建文件
│   └── .env.docker     # Docker 环境配置
├── API.md                # API 文档
├── docker-compose.yml    # Docker Compose 配置
├── Cargo.toml           # Rust 项目配置
└── .env                 # 环境配置
```

## 环境配置说明

主要配置项（在 `.env` 或 `.env.docker` 文件中）：

```env
# 数据库配置
MONGODB_URI=mongodb://localhost:27017/
DATABASE_NAME=card_platform

# 安全配置
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRATION_HOURS=24
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# 服务器配置
SERVER_HOST=0.0.0.0
SERVER_PORT=6000

# 日志配置
LOG_LEVEL=info
LOG_FILE=./logs/card-platform.log
```

## API 文档

详细的 API 文档请参考 [API.md](API.md)

## 主要功能模块

### 用户管理
- 用户注册
- 用户登录
- 用户信息管理
- 角色权限控制

### 卡密管理
- 生成卡密
- 验证卡密
- 激活卡密
- 导出卡密
- 删除卡密

### 日志系统
- 操作日志记录
- 错误日志记录
- 安全日志记录

## 安全建议

1. 修改默认管理员密码
2. 使用强密码策略
3. 定期更换 JWT 密钥
4. 限制 API 访问频率
5. 定期备份数据
6. 监控系统日志
7. 使用 HTTPS
8. 配置防火墙规则
9. 定期更新依赖

## 许可证

MIT License

## 贡献指南

1. Fork 项目
2. 创建特性分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request

## 联系方式

如有问题或建议，请提交 Issue 或联系维护者。 