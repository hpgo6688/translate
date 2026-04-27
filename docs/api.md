# 服务端 API 设计

> 配套文档:[整体架构](architecture.md) · [模块拆分](modules.md) · [技术选型](tech-stack.md)

仅 SaaS / 自部署 服务端的对外接口。Free 模式直连 provider,不走这套 API。

## 通用约定

### 基础

- Base URL:`https://api.example.com`
- 版本前缀:`/v1`,破坏性变更走 `/v2`
- 协议:HTTPS only,HTTP/2 启用
- 内容类型:`application/json; charset=utf-8`,文件上传 `multipart/form-data`
- 流式:SSE(`text/event-stream`),仅字幕场景用 WebSocket

### 认证

```
Authorization: Bearer <jwt-or-api-key>
```

- **JWT**:用户登录后获得,access token 1h,refresh token 30d
- **API Key**:用户在 options 页生成,长期有效,可多个,可绑定 IP/域名

### 错误格式

所有非 2xx 返回:

```json
{
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "Monthly token quota exceeded for plan free.",
    "request_id": "req_01HG...",
    "retryable": false,
    "details": { "limit": 100000, "used": 100432 }
  }
}
```

主要错误码:

| HTTP | code | 含义 |
|---|---|---|
| 400 | `INVALID_REQUEST` | 参数错误 |
| 401 | `UNAUTHENTICATED` | 未登录或 token 失效 |
| 403 | `FORBIDDEN` | 已登录但无权限 |
| 404 | `NOT_FOUND` | 资源不存在 |
| 409 | `CONFLICT` | 资源冲突(如重复创建) |
| 429 | `RATE_LIMITED` | 触发限流;返回 `Retry-After` 头 |
| 429 | `QUOTA_EXCEEDED` | 用量配额超限 |
| 502 | `PROVIDER_FAILED` | 上游 provider 失败,可重试 |
| 503 | `SERVICE_UNAVAILABLE` | 服务降级中 |

### 限流头

每个响应携带:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 873
X-RateLimit-Reset: 1714200000
```

### 分页

游标式:

```
GET /v1/jobs?limit=20&cursor=eyJ...
```

返回 `{"items":[...], "next_cursor": "..."}`,无下一页时 `next_cursor` 为 null。

### Idempotency

写接口支持 `Idempotency-Key` 头,服务端 24h 内识别重复请求并返回首次结果。

---

## 1. 翻译

### 1.1 同步流式翻译

`POST /v1/translate`

最高频接口。支持 SSE 流式或一次返回。

请求:

```json
{
  "source_lang": "auto",
  "target_lang": "zh-CN",
  "provider": "claude-sonnet-4-6",
  "stream": true,
  "segments": [
    { "id": "p1", "text": "Hello world." },
    { "id": "p2", "text": "Foo bar baz." }
  ],
  "context": {
    "url": "https://example.com/article",
    "page_title": "Example Article",
    "domain": "example.com",
    "glossary_id": "gls_01HG..."
  },
  "options": {
    "style": "formal",
    "preserve_terms": ["GraphQL", "K8s"],
    "system_prompt": null
  }
}
```

字段:

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `source_lang` | string | 否 | BCP-47;`auto` 自动识别;默认 `auto` |
| `target_lang` | string | 是 | BCP-47 |
| `provider` | string | 否 | 不传走用户默认 |
| `stream` | bool | 否 | 默认 `false` |
| `segments` | array | 是 | 一次最多 50 段或 30k 字符 |
| `segments[].id` | string | 是 | 客户端生成,服务端原样返回 |
| `segments[].text` | string | 是 | 单段最长 4000 字符 |
| `context.*` | object | 否 | 提供给 LLM 做上下文 |
| `options.style` | enum | 否 | `literal` / `formal` / `casual` / `academic` |
| `options.preserve_terms` | array | 否 | 这些词保留原文 |
| `options.system_prompt` | string | 否 | 用户自定义 prompt(覆盖默认) |

非流式响应:

```json
{
  "results": [
    { "id": "p1", "text": "你好,世界。", "detected_lang": "en" },
    { "id": "p2", "text": "测试一下。", "detected_lang": "en" }
  ],
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 20,
    "cost_usd": 0.0003
  },
  "cache_hits": ["p1"],
  "request_id": "req_01HG..."
}
```

流式响应(SSE):

```
event: segment
data: {"id":"p1","text":"你好,","done":false}

event: segment
data: {"id":"p1","text":"世界。","done":true}

event: segment
data: {"id":"p2","text":"测试一下。","done":true}

event: done
data: {"usage":{"prompt_tokens":50,"completion_tokens":20,"cost_usd":0.0003},"cache_hits":["p1"]}
```

错误事件:

```
event: error
data: {"code":"PROVIDER_FAILED","message":"...","retryable":true}
```

### 1.2 字幕实时翻译(WebSocket)

`GET /v1/translate/stream`(Upgrade: websocket)

客户端→服务端:

```json
{ "type": "cue", "id": "c1", "text": "Hello", "ts": 12.3 }
```

服务端→客户端:

```json
{ "type": "translation", "id": "c1", "text": "你好", "ts": 12.3 }
```

服务端按 200ms 合并 cue,批量调用 provider,降低成本。

---

## 2. 文档异步任务

### 2.1 创建任务

`POST /v1/jobs/document`

`multipart/form-data`:

| 字段 | 类型 | 说明 |
|---|---|---|
| `file` | file | PDF / EPUB / SRT / VTT / DOCX,≤ 50MB |
| `source_lang` | string | 默认 `auto` |
| `target_lang` | string | 必填 |
| `provider` | string | 默认用户偏好 |
| `output_format` | string | `bilingual_pdf` / `target_pdf` / `bilingual_epub` / `target_epub` / `srt` |
| `glossary_id` | string | 可选 |
| `mode` | string | `standard` / `academic`(学术模式开启 LangGraph 校对环) |

响应 `202 Accepted`:

```json
{
  "id": "job_01HG...",
  "status": "queued",
  "created_at": "2026-04-27T10:00:00Z",
  "estimated_tokens": 120000,
  "estimated_cost_usd": 1.2
}
```

### 2.2 查询任务

`GET /v1/jobs/{id}`

```json
{
  "id": "job_01HG...",
  "type": "document",
  "status": "running",
  "progress": 0.42,
  "stage": "translating_chapter_3_of_8",
  "created_at": "...",
  "updated_at": "...",
  "result_url": null,
  "error": null,
  "usage": { "prompt_tokens": 50000, "completion_tokens": 20000 }
}
```

`status` 取值:`queued` / `running` / `succeeded` / `failed` / `canceled`

### 2.3 任务事件流(SSE)

`GET /v1/jobs/{id}/events`

服务端持续推送进度,完成后关闭连接。客户端不必轮询。

```
event: progress
data: {"progress":0.42,"stage":"translating_chapter_3_of_8"}

event: done
data: {"result_url":"https://...","usage":{...}}
```

### 2.4 下载结果

`GET /v1/jobs/{id}/result` → 302 → 对象存储签名 URL,默认有效期 1h。

### 2.5 取消 / 列表 / 删除

```
POST   /v1/jobs/{id}/cancel
GET    /v1/jobs?type=document&status=running&limit=20&cursor=...
DELETE /v1/jobs/{id}     # 仅删除 job 元数据 + 结果文件,不影响计费
```

---

## 3. 用户与账号

### 3.1 注册 / 登录

```
POST /v1/auth/signup        { email, password }
POST /v1/auth/login         { email, password }    → { access_token, refresh_token }
POST /v1/auth/oauth/{github|google}
POST /v1/auth/refresh       { refresh_token }
POST /v1/auth/logout
POST /v1/auth/password/reset
```

### 3.2 当前用户

```
GET  /v1/me                 # 用户资料、订阅状态
GET  /v1/me/usage?period=2026-04   # 当月用量明细
GET  /v1/me/quota           # 剩余额度
PATCH /v1/me                # 改昵称、默认语言、默认 provider 等
```

`GET /v1/me` 响应:

```json
{
  "id": "usr_01HG...",
  "email": "user@example.com",
  "plan": "pro",
  "subscription": {
    "status": "active",
    "renews_at": "2026-05-15T00:00:00Z"
  },
  "preferences": {
    "default_target_lang": "zh-CN",
    "default_provider": "claude-sonnet-4-6"
  }
}
```

### 3.3 API Key 管理

```
GET    /v1/me/api-keys              # 列出
POST   /v1/me/api-keys              # 创建,返回明文(仅此一次)
DELETE /v1/me/api-keys/{id}
```

请求体:

```json
{
  "name": "my-laptop",
  "scopes": ["translate"],
  "ip_allowlist": ["1.2.3.4/32"],
  "expires_at": null
}
```

### 3.4 用户托管的 Provider Key(BYOK)

允许用户在 SaaS 模式下自带某 provider 的 Key(走自己的额度,平台只代理):

```
GET    /v1/me/provider-keys
PUT    /v1/me/provider-keys/{provider}    { api_key, base_url? }
DELETE /v1/me/provider-keys/{provider}
```

服务端入库前 AES-GCM 加密,响应永不返回明文。

---

## 4. 配置同步

### 4.1 术语表

```
GET    /v1/glossaries
POST   /v1/glossaries                { name, target_lang }
GET    /v1/glossaries/{id}
PATCH  /v1/glossaries/{id}
DELETE /v1/glossaries/{id}

GET    /v1/glossaries/{id}/terms
POST   /v1/glossaries/{id}/terms     { source, target, case_sensitive }
PATCH  /v1/glossaries/{id}/terms/{term_id}
DELETE /v1/glossaries/{id}/terms/{term_id}

POST   /v1/glossaries/{id}/import    # CSV / JSON 批量导入
GET    /v1/glossaries/{id}/export
```

### 4.2 域名规则

```
GET    /v1/rules
POST   /v1/rules            { domain, action, selector?, priority }
PATCH  /v1/rules/{id}
DELETE /v1/rules/{id}
```

`action` ∈ `auto_translate` / `never_translate` / `custom_selector`

### 4.3 Prompt 模板

```
GET    /v1/prompts
POST   /v1/prompts          { name, system_prompt, applies_to }
...
```

---

## 5. 元数据

### 5.1 Provider 列表

`GET /v1/providers`

```json
{
  "providers": [
    {
      "id": "claude-sonnet-4-6",
      "vendor": "anthropic",
      "type": "llm",
      "supports_streaming": true,
      "max_input_chars": 200000,
      "pricing": { "input_per_1k_tokens": 0.003, "output_per_1k_tokens": 0.015 }
    },
    {
      "id": "google-translate",
      "vendor": "google",
      "type": "mt",
      "supports_streaming": false,
      "pricing": { "per_1k_chars": 0.02 }
    }
  ]
}
```

### 5.2 语种列表

`GET /v1/languages` → BCP-47 列表 + 中英文显示名

### 5.3 健康

```
GET /healthz       # liveness
GET /readyz        # readiness(DB/Redis 检查)
GET /version       # 构建信息
```

---

## 6. 计费 Webhook

`POST /v1/webhooks/stripe`,签名校验 + 幂等。处理 `customer.subscription.*` `invoice.*` 事件。

不对外文档化,仅 Stripe 调用。

---

## 7. 速率与限制

| 套餐 | QPS | 月 Token | 单文档大小 | 并发文档 Job |
|---|---|---|---|---|
| Free | 5 | 100k | 10MB | 1 |
| Pro | 30 | 5M | 50MB | 5 |
| Team | 100 | 50M | 200MB | 20 |

Free 套餐部分 provider 走平台默认 Key,Pro+ 提供完整 provider 列表。

---

## 8. 客户端 SDK 期望

虽然客户端是浏览器扩展,但应抽出 `@translate/api-client` 包供其他端(CLI / Web App / 自家工具)复用:

- 自动管理 access/refresh token 轮换
- SSE 解析为 AsyncIterator
- 自动重试(429/502,指数退避)
- TypeScript 类型从 OpenAPI 生成
