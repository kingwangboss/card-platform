# 构建阶段
FROM rust:1.85-slim as builder

# 设置环境变量
ENV RUSTUP_DIST_SERVER=https://mirrors.tuna.tsinghua.edu.cn/rustup
ENV CARGO_NET_GIT_FETCH_WITH_CLI=true
# 强制使用 HTTP/1.1 避免 HTTP/2 流错误
ENV CARGO_HTTP_MULTIPLEXING=false
ENV CARGO_HTTP_TIMEOUT=300
ENV CARGO_HTTP_CAINFO=/etc/ssl/certs/ca-certificates.crt
ENV CARGO_HTTP_CHECK_REVOKE=false
ENV CARGO_HTTP_RETRY=5

# 设置工作目录
WORKDIR /usr/src/app

# 首先只复制 Cargo.toml 和 Cargo.lock (如果存在)
COPY Cargo.toml ./
COPY Cargo.lock ./

# 创建一个虚拟的 src/main.rs 文件，以便 cargo 可以解析依赖项
RUN mkdir -p src && \
    echo "fn main() {println!(\"dummy\")}" > src/main.rs && \
    cargo build --release && \
    rm -rf src/

# 现在复制实际的源代码
COPY . .

# 重新构建项目，这次会使用缓存的依赖项
RUN cargo build --release

# 使用更新的基础镜像作为运行环境
FROM debian:bookworm-slim

# 使用清华源
RUN sed -i 's/deb.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list \
    && sed -i 's|security.debian.org/debian-security|mirrors.tuna.tsinghua.edu.cn/debian-security|g' /etc/apt/sources.list

# 安装运行时依赖
RUN apt-get update && apt-get install -y \
    libssl3 \
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
COPY --from=builder --chown=app:app /usr/src/app/.env.example ./.env

# 暴露端口
EXPOSE 5005

# 启动程序
CMD ["./card-platform"] 