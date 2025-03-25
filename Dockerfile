# 构建阶段
FROM rust:1.85-slim as builder

# 设置环境变量
ENV RUSTUP_DIST_SERVER=https://mirrors.tuna.tsinghua.edu.cn/rustup
ENV CARGO_NET_GIT_FETCH_WITH_CLI=true

# 设置工作目录
WORKDIR /usr/src/app

# 复制项目文件
COPY . .

# 删除现有的 Cargo.lock 并构建项目
RUN rm -f Cargo.lock && cargo build --release

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
RUN mkdir -p /app/logs /app/static /app/config
RUN chown -R app:app /app

# 切换到非 root 用户
USER app

# 设置工作目录
WORKDIR /app

# 从构建阶段复制编译好的程序和必要文件
COPY --from=builder --chown=app:app /usr/src/app/target/release/card-platform .
COPY --from=builder --chown=app:app /usr/src/app/static ./static
COPY --from=builder --chown=app:app /usr/src/app/.env.example ./config/.env.example
COPY --from=builder --chown=app:app /usr/src/app/config/* ./config/

# 暴露端口
EXPOSE 5005

# 启动程序
CMD ["./card-platform"] 