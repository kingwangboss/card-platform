# 卡密管理系统 API 文档

## 基础信息
- 基础URL: `http://localhost:5005/api`
- 认证方式: Bearer Token (除了验证卡密接口外，其他接口都需要在请求头中添加 `Authorization: Bearer {token}`)

## 卡密相关接口

### 生成卡密
- 请求方法: `POST`
- 路径: `/cards/generate`
- Content-Type: `application/json`
- 请求体:

### 验证卡密
- 请求方法: `POST`
- 路径: `/cards/verify`
- 说明: 验证卡密是否有效，如果未激活则自动激活。此接口不需要认证。
- 请求体:

``` json
{
  "card_number": "1pZKyLAywgUOEUqd" // 要验证的卡密号码
}
```

- 成功响应 (未激活卡密):
``` json
{
    "message": "Card activated successfully",
    "card": {
    "card_number": "1pZKyLAywgUOEUqd",
    "duration_days": 30,
    "is_activated": true,
    "activated_at_str": "2024-01-01T12:00:00Z",
    "expires_at_str": "2024-01-31T12:00:00Z"
    }
}
```

- 成功响应 (已激活且有效的卡密):
``` json
{
    "card_number": "1pZKyLAywgUOEUqd",
    "duration_days": 30,
    "is_activated": true,
    "activated_at_str": "2024-01-01T12:00:00Z",
    "expires_at_str": "2024-01-31T12:00:00Z"
}

```

- 错误响应:
- 404 Not Found: 卡密不存在
- 400 Bad Request: 卡密已过期
- 500 Internal Server Error: 服务器内部错误


### 生成卡密 (需要认证)
- 请求方法: `POST`
- 路径: `/cards/generate`
- 请求体:
``` json
{
  "duration_days": 30 // 卡密有效天数
}
```

- 成功响应:
``` json
{
    "card_number": "1pZKyLAywgUOEUqd",
    "duration_days": 30,
    "is_activated": false,
    "activated_at_str": null,
    "expires_at_str": null,
    "created_at_str": "2024-01-01T12:00:00Z"
}
```

### 获取所有卡密 (需要认证)
- 请求方法: `GET`
- 路径: `/cards`
- 成功响应:
``` json
[
    {
    "card_number": "1pZKyLAywgUOEUqd",
    "duration_days": 30,
    "is_activated": false,
    "activated_at_str": null,
    "expires_at_str": null,
    "created_at_str": "2024-01-01T12:00:00Z"
    }
]
```
### 删除卡密 (需要认证)
- 请求方法: `DELETE`
- 路径: `/cards/{id}`
- 成功响应: `Card deleted successfully`
- 错误响应:
  - 404 Not Found: 卡密不存在
  - 400 Bad Request: 无效的ID格式

### 导出卡密 (需要认证)
- 请求方法: `GET`
- 路径: `/cards/export`
- 响应类型: `text/csv`
- 响应头:
  - `Content-Type: text/csv; charset=utf-8`
  - `Content-Disposition: attachment; filename="cards.csv"`

## 用户相关接口

### 用户登录
- 请求方法: `POST`
- 路径: `/users/login`
- 请求体:
``` json
{
  "username": "admin",
  "password": "123456"
}
```

- 成功响应:
``` json
{
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
    "id": "507f1f77bcf86cd799439011",
    "username": "admin",
    "email": null,
    "role": "Admin"
    }
}
```

### 注册用户 (需要管理员权限)
- 请求方法: `POST`
- 路径: `/users/register`
- 请求体:
``` json
{
    "username": "newuser",
    "password": "password123",
    "email": "user@example.com",
    "role": "User" // "User" 或 "Admin"
}
```

- 成功响应:
``` json
{
    "id": "507f1f77bcf86cd799439011",
    "username": "newuser",
    "email": "user@example.com",
    "role": "User"
}
```

### 获取所有用户 (需要管理员权限)
- 请求方法: `GET`
- 路径: `/users`
- 成功响应:
``` json
[
    {
    "id": "507f1f77bcf86cd799439011",
    "username": "admin",
    "email": null,
    "role": "Admin"
    }
]
```

### 更新用户 (需要管理员权限)
- 请求方法: `PUT`
- 路径: `/users/{id}`
- 请求体:
``` json
{
    "username": "updatedname", // 可选
    "password": "newpassword", // 可选
    "email": "new@example.com", // 可选
    "role": "Admin" // 可选
}
``` 

- 成功响应: `User updated successfully`

### 删除用户 (需要管理员权限)
- 请求方法: `DELETE`
- 路径: `/users/{id}`
- 成功响应: `User deleted successfully`

## 错误响应格式
所有接口在发生错误时都会返回相应的 HTTP 状态码和错误信息：
- 400 Bad Request: 请求参数错误
- 401 Unauthorized: 未认证或认证失败
- 403 Forbidden: 权限不足
- 404 Not Found: 资源不存在
- 500 Internal Server Error: 服务器内部错误

## 注意事项
1. 卡密一旦激活就开始计时，无法暂停或重置
2. 过期的卡密无法重新激活
3. 建议使用验证接口而不是手动激活接口
4. 卡密有效期从激活时间开始计算
5. 支持的有效期天数：1天、7天、15天、30天、90天、365天等
6. 管理员用户可以管理所有用户和卡密
7. 普通用户只能管理卡密