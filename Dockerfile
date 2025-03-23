# 使用官方 Rust 镜像作为构建环境
FROM rust:1.75-slim as builder

# 设置工作目录
WORKDIR /usr/src/app

# 安装构建依赖
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# 复制项目文件
COPY . .

# 构建项目
RUN cargo build --release

# 使用更小的基础镜像作为运行环境
FROM debian:bullseye-slim

# 安装运行时依赖
RUN apt-get update && apt-get install -y \
    libssl1.1 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 创建非 root 用户
RUN useradd -m -u 1000 -U app

# 创建必要的目录
RUN mkdir -p /app/logs /app/static
RUN chown -R app:app /app

# 切换到非 root 用户
USER app

# 设置工作目录
WORKDIR /app

# 从构建阶段复制编译好的程序和必要文件
COPY --from=builder --chown=app:app /usr/src/app/target/release/card-platform .
COPY --from=builder --chown=app:app /usr/src/app/static ./static

# 暴露端口
EXPOSE 8080

# 启动程序
CMD ["./card-platform"] 