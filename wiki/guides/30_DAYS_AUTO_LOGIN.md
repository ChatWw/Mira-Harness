# 30 天免登录功能说明

> 功能实现时间：2026-07-06

---

## 功能概述

实现了"30天内免登录"功能，用户可以选择是否在 30 天内保持登录状态。

---

## 实现机制

### 1. Token 过期时间管理

**存储键**：
- `core-platform-token` - Token 值
- `core-platform-user` - 用户信息
- `core-platform-token-expire` - Token 过期时间（时间戳）

**过期时间规则**：
- ✅ **勾选"30天内免登录"**：过期时间 = 当前时间 + 30 天
- ⏳ **不勾选**：过期时间 = 当前时间 + 7 天

### 2. 登录逻辑（user.ts）

```typescript
async function login(payload: LoginPayload) {
  // ... 验证账号密码 ...
  
  // 计算过期时间
  let expireTime: number
  if (payload.remember) {
    // 30 天免登录
    expireTime = Date.now() + 30 * 24 * 60 * 60 * 1000
  } else {
    // 7 天过期
    expireTime = Date.now() + 7 * 24 * 60 * 60 * 1000
  }
  
  // 保存到 localStorage
  localStorage.setItem(TOKEN_KEY, mockToken)
  localStorage.setItem(USER_INFO_KEY, JSON.stringify(mockUser))
  localStorage.setItem(TOKEN_EXPIRE_KEY, expireTime.toString())
}
```

### 3. 过期检查

```typescript
// 检查 token 是否过期
const isTokenExpired = (): boolean => {
  const expireTime = localStorage.getItem(TOKEN_EXPIRE_KEY)
  if (!expireTime) return true
  return Date.now() > Number(expireTime)
}

// 登录状态计算（computed）
const isLoggedIn = computed(() => {
  if (!token.value) return false
  if (isTokenExpired()) {
    // Token 已过期，清除登录状态
    logout()
    return false
  }
  return true
})
```

### 4. 路由守卫检查

路由守卫会调用 `userStore.isLoggedIn` 进行检查：
- 如果 token 过期 → 自动执行 `logout()` → 重定向到登录页
- 如果 token 有效 → 允许访问

---

## 使用流程

### 用户操作流程

1. **登录时**
   - 用户输入账号密码
   - 勾选/不勾选"30天内免登录"
   - 点击登录按钮

2. **系统处理**
   - 验证账号密码
   - 根据 remember 状态计算过期时间
   - 保存 token、用户信息、过期时间到 localStorage
   - 跳转到工作台

3. **访问页面时**
   - 路由守卫检查 token 是否存在
   - 检查 token 是否过期
   - 过期则自动退出并跳转登录页
   - 未过期则正常访问

### 示例

**场景 1：勾选 30 天免登录**
```
用户登录（勾选） → Token 30天后过期
第 1 天访问 → ✅ 正常访问
第 15 天访问 → ✅ 正常访问
第 31 天访问 → ❌ Token 过期，重定向到登录页
```

**场景 2：不勾选**
```
用户登录（不勾选） → Token 7天后过期
第 1 天访问 → ✅ 正常访问
第 5 天访问 → ✅ 正常访问
第 8 天访问 → ❌ Token 过期，重定向到登录页
```

---

## 技术细节

### localStorage 存储示例

```javascript
// 登录后 localStorage 内容
{
  "core-platform-token": "demo-token-1735901234567",
  "core-platform-user": "{\"id\":\"1\",\"name\":\"超级管理员\",\"email\":\"admin@example.com\",\"avatar\":\"\",\"roles\":[\"admin\"]}",
  "core-platform-token-expire": "1738493234567"  // 时间戳
}
```

### 时间计算

```typescript
// 30 天的毫秒数
30 * 24 * 60 * 60 * 1000 = 2,592,000,000 毫秒

// 7 天的毫秒数
7 * 24 * 60 * 60 * 1000 = 604,800,000 毫秒

// 当前时间戳
Date.now() = 1735901234567

// 30 天后的时间戳
1735901234567 + 2592000000 = 1738493234567
```

---

## 扩展功能

### 1. 刷新 Token 过期时间（可选）

如果需要"活跃用户自动延长 token"功能：

```typescript
// 在 user.ts 中已提供此方法
function refreshTokenExpire() {
  const expireTime = localStorage.getItem(TOKEN_EXPIRE_KEY)
  if (expireTime && token.value) {
    if (!isTokenExpired()) {
      // 延长到当前时间 + 30 天
      const newExpireTime = Date.now() + 30 * 24 * 60 * 60 * 1000
      localStorage.setItem(TOKEN_EXPIRE_KEY, newExpireTime.toString())
    }
  }
}

// 在路由守卫或关键操作处调用
router.afterEach(() => {
  userStore.refreshTokenExpire()  // 每次路由切换刷新过期时间
})
```

### 2. 显示剩余天数

```typescript
// 计算剩余天数
function getRemainingDays(): number {
  const expireTime = localStorage.getItem(TOKEN_EXPIRE_KEY)
  if (!expireTime) return 0
  const remaining = Number(expireTime) - Date.now()
  return Math.ceil(remaining / (24 * 60 * 60 * 1000))
}

// 在用户中心显示
console.log(`Token 还有 ${getRemainingDays()} 天过期`)
```

### 3. 过期前提醒

```typescript
// 在 App.vue 中监听过期时间
const checkTokenExpireSoon = () => {
  const expireTime = localStorage.getItem(TOKEN_EXPIRE_KEY)
  if (!expireTime) return
  
  const remaining = Number(expireTime) - Date.now()
  const remainingDays = remaining / (24 * 60 * 60 * 1000)
  
  // 小于 3 天时提醒
  if (remainingDays < 3 && remainingDays > 0) {
    ElMessage.warning(`您的登录状态将在 ${Math.ceil(remainingDays)} 天后过期`)
  }
}
```

---

## 后端对接建议

### 1. 后端 Token 管理

后端应该：
- 生成带过期时间的 JWT Token
- 返回 `token` 和 `expiresIn`（过期时间，秒）
- 提供 Token 刷新接口

**登录接口响应示例**：
```json
{
  "code": 200,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 2592000,  // 30天（秒）
    "user": {
      "id": "1",
      "name": "超级管理员",
      "email": "admin@example.com"
    }
  }
}
```

### 2. 前端对接

```typescript
async function login(payload: LoginPayload) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      account: payload.account,
      password: payload.password,
      remember: payload.remember  // 传递给后端
    })
  })
  
  const data = await response.json()
  
  if (data.code === 200) {
    token.value = data.data.token
    userInfo.value = data.data.user
    
    // 计算过期时间（当前时间 + 后端返回的秒数）
    const expireTime = Date.now() + data.data.expiresIn * 1000
    
    localStorage.setItem(TOKEN_KEY, data.data.token)
    localStorage.setItem(USER_INFO_KEY, JSON.stringify(data.data.user))
    localStorage.setItem(TOKEN_EXPIRE_KEY, expireTime.toString())
    
    return { success: true }
  }
}
```

### 3. Token 刷新

如果后端支持 Token 刷新：

```typescript
async function refreshToken() {
  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.value}`
      }
    })
    
    const data = await response.json()
    
    if (data.code === 200) {
      token.value = data.data.token
      const expireTime = Date.now() + data.data.expiresIn * 1000
      localStorage.setItem(TOKEN_KEY, data.data.token)
      localStorage.setItem(TOKEN_EXPIRE_KEY, expireTime.toString())
    }
  } catch (error) {
    console.error('Token 刷新失败', error)
    logout()
  }
}
```

---

## 安全建议

### 1. HTTPS

- ⚠️ **必须使用 HTTPS**：防止 Token 被窃取

### 2. httpOnly Cookie（更安全）

如果对安全性要求高，建议后端使用 httpOnly Cookie 存储 Token：

```typescript
// 后端设置 Cookie
res.cookie('token', token, {
  httpOnly: true,      // 前端 JS 无法访问
  secure: true,        // 仅 HTTPS
  sameSite: 'strict',  // 防止 CSRF
  maxAge: 30 * 24 * 60 * 60 * 1000  // 30天
})

// 前端无需手动存储 Token，浏览器自动携带
```

### 3. XSS 防护

- ✅ 避免使用 `innerHTML`
- ✅ 对用户输入进行转义
- ✅ 使用 Content Security Policy (CSP)

### 4. CSRF 防护

- ✅ 使用 CSRF Token
- ✅ 验证请求来源
- ✅ 使用 SameSite Cookie

---

## 测试验证

### 手动测试步骤

1. **测试 30 天免登录**
   - 登录并勾选"30天内免登录"
   - 打开浏览器开发工具 → Application → Local Storage
   - 查看 `core-platform-token-expire` 值
   - 计算时间戳对应的日期（应该是 30 天后）

2. **测试不勾选（7 天）**
   - 登录不勾选
   - 查看过期时间（应该是 7 天后）

3. **测试过期逻辑**
   - 手动修改 `core-platform-token-expire` 为过去的时间
   - 刷新页面或访问任何需要登录的页面
   - 应该自动跳转到登录页

4. **测试退出登录**
   - 点击退出按钮
   - 检查 localStorage 是否清空

---

## 更新日志

**v1.1.0 (2026-07-06)**
- ✅ 新增 30 天免登录功能
- ✅ 新增 Token 过期时间管理
- ✅ 新增自动过期检查和登出
- ✅ 不勾选时默认 7 天过期

---

## 常见问题

### Q1: 为什么刷新页面后还是登录状态？

因为 Token 和过期时间存储在 localStorage 中，刷新页面不会丢失。只有在以下情况会退出登录：
- Token 过期
- 用户主动退出
- 清除浏览器缓存

### Q2: 可以修改默认的 7 天和 30 天吗？

可以，在 `src/stores/user.ts` 的 `login` 方法中修改：

```typescript
if (payload.remember) {
  expireTime = Date.now() + 90 * 24 * 60 * 60 * 1000  // 改为 90 天
} else {
  expireTime = Date.now() + 1 * 24 * 60 * 60 * 1000   // 改为 1 天
}
```

### Q3: 如何清除已过期的 Token？

Token 过期后会自动调用 `logout()` 清除所有数据。如果需要手动清除：

```javascript
localStorage.removeItem('core-platform-token')
localStorage.removeItem('core-platform-user')
localStorage.removeItem('core-platform-token-expire')
```

### Q4: 多个标签页之间会同步吗？

会同步。因为使用的是 localStorage，所有标签页共享同一个存储空间。一个标签页退出登录，其他标签页刷新后也会退出。

---

**文档版本**: 1.0  
**最后更新**: 2026-07-06
