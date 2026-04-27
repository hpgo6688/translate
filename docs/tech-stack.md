# 技术选型

> 配套文档:[整体架构](architecture.md) · [模块拆分](modules.md) · [服务端 API](api.md)

每个选型给出 **结论 / 替代方案 / 决策依据**,不做无支撑的「最佳实践」推荐。

---

## 1. 客户端(浏览器扩展)

> **客户端技术栈以 [technology-stack.md](technology-stack.md) 为准**,本节只做摘要 + 与服务端协作相关的少量补充。

### 1.1 摘要

| 类别 | 选型 |
|---|---|
| 框架 | [WXT](https://wxt.dev)(Vite,跨浏览器,MV3) |
| 语言 | TypeScript(strict) |
| UI | React 18 + Tailwind,**含 content script**(通过 `createShadowRootUi` 注入 Shadow DOM 隔离) |
| 组件库 | shadcn/ui(+ Radix 底层) |
| 状态 | Zustand + persist 中间件;跨上下文用 `chrome.storage.onChanged` 同步 |
| 存储 | `chrome.storage`(配置) + IndexedDB / Dexie(段落缓存、术语表、单词本) |
| 通信 | `@webext-core/messaging` + `@webext-core/storage`(类型安全) |
| 请求 | ofetch + p-queue(并发控制) + p-retry(重试) |
| 表单/校验 | react-hook-form + zod |
| i18n | i18next + react-i18next |
| 图标 | lucide-react |
| PDF/EPUB/字幕 | pdfjs-dist / epubjs / subsrt-ts |
| 测试 | Vitest + Playwright |
| 包管理 | pnpm(monorepo) |

### 1.2 与本文档先前版本的差异

之前版本里有两条与 [technology-stack.md](technology-stack.md) 冲突的判断,已作废:

- ~~content script 不用 React~~ → 用 React + Shadow DOM 隔离,样式污染由 `createShadowRootUi` 解决;体积顾虑通过代码分割 + 必要时换 Preact 应对
- ~~不引入状态库~~ → Zustand(~1KB),跨上下文同步成本可接受

### 1.3 与服务端协作的客户端约定

这部分不在 technology-stack.md 范畴,在此明确,作为 [api.md](api.md) 的对端约定:

- **SSE 消费**:封装为 AsyncIterator,统一在 `service-worker/translate-orchestrator` 中消费后转发给 content script
- **错误协议**:复用 [api.md](api.md) §通用约定 的错误结构,客户端按 `retryable` 决定本地重试
- **认证**:access token 存 `chrome.storage.local`(非 sync,避免泄漏到其他设备),refresh 在 background 中静默执行
- **离线降级**:网关不可用时 service-worker 自动切回 Free 模式直连 provider(若用户配置了 BYOK)

### 1.4 PDF 渲染

PDF.js,劫持 `*.pdf` 请求挂载自带阅读器。客户端只渲染,不在前端做版面分析 —— 异步任务路径下,排版还原由 [LangGraph worker 的 doc-pipeline](modules.md) 完成。

---

## 2. 服务端 Gateway:Go

### 2.1 为什么是 Go 而不是 Node / Python / Rust

| 候选 | 取舍 |
|---|---|
| **Go ✅** | 高并发 IO、流式代理、低内存、单二进制部署、SSE/WebSocket 原生 |
| Node/TS | 与客户端语言一致,但单线程 + GC 在大量长连接下劣于 Go |
| Python/FastAPI | 异步生态薄、部署复杂、性能 1/3-1/5 of Go |
| Rust | 性能好,但开发速度 / 生态 / 招聘成本不划算 |

### 2.2 关键库

| 用途 | 选型 | 替代 / 拒绝原因 |
|---|---|---|
| HTTP 路由 | [chi](https://github.com/go-chi/chi) | gin 中间件不够干净;echo 类似;net/http 太裸 |
| 配置 | [viper](https://github.com/spf13/viper) + [envconfig](https://github.com/kelseyhightower/envconfig) | — |
| DB | Postgres + [sqlc](https://sqlc.dev) | gorm 黑盒、N+1 难排;sqlc 直接生成类型化 Go 代码 |
| Migration | [goose](https://github.com/pressly/goose) | 简单稳定 |
| Redis | [go-redis](https://github.com/redis/go-redis) | — |
| 日志 | [zap](https://github.com/uber-go/zap) | 结构化、零分配 |
| Tracing | OpenTelemetry SDK | — |
| JWT | [golang-jwt/jwt](https://github.com/golang-jwt/jwt) | — |
| 验证 | [go-playground/validator](https://github.com/go-playground/validator) | — |
| LLM SDK | 各 provider 官方 SDK,自封统一接口 | 不用 langchain-go(质量与活跃度都不够) |

### 2.3 流式

SSE 优先(简单、HTTP/2 友好、断线易恢复),WebSocket 仅用于字幕实时翻译。

### 2.4 不用 gRPC

对外是浏览器,只能用 HTTP/SSE/WebSocket。内部服务少,REST + 队列足够,gRPC 收益不抵复杂度。

---

## 3. 服务端 Workflow Worker:Python + LangGraph

### 3.1 为什么是 LangGraph

只在 [architecture.md §6](architecture.md) 列出的场景使用:多步骤、有状态、需要 checkpoint、可能分支/合流。

| 候选 | 取舍 |
|---|---|
| **LangGraph ✅** | 显式 state machine + checkpoint 落 Postgres + 与 LangChain 生态打通 |
| 自写 Python 编排 | 起步快,但 checkpoint / 重试 / 流式都得自造,长远不划算 |
| Temporal | 工作流引擎更成熟,但学习成本高,过度设计 |
| Go + 自写 | LLM 编排 Python 生态领先太多(prompt 模板、解析、评测),硬上 Go 不值 |

### 3.2 关键库

| 用途 | 选型 |
|---|---|
| 工作流 | LangGraph |
| Provider SDK | 各官方 SDK(anthropic / openai / google-genai),不依赖 LangChain abstraction |
| PDF 解析 | [unstructured](https://github.com/Unstructured-IO/unstructured) 或 [pymupdf](https://pymupdf.readthedocs.io) |
| EPUB 解析 | [ebooklib](https://github.com/aerkalov/ebooklib) |
| 队列消费 | [redis-py](https://redis.readthedocs.io) Streams 或 [nats-py](https://github.com/nats-io/nats.py) |
| 任务运行 | 直接进程 + supervisor;暂不上 Celery(队列已有) |

### 3.3 与 Gateway 的边界

- gateway **不直接调** worker,所有交互通过队列 + Postgres 状态
- worker **不对外暴露 HTTP**,降低攻击面
- 共享:Postgres schema(用 sqlc 生成 Go,SQLAlchemy/asyncpg 生成 Python),Redis cache key 规范

---

## 4. 存储

### 4.1 Postgres(主库)

承载用户、订阅、用量、术语表、job 元数据、LangGraph checkpoint。

- 版本:16+
- 扩展:`pgcrypto`(加密 Key 存储)
- 暂不用 pgvector — 搜索/RAG 不在当前范围

### 4.2 Redis

- 缓存:翻译段落共享缓存,key = `tx:{provider}:{src→tgt}:{hash(normalize(text))}`
- 限流:[Redis Cell](https://github.com/brandur/redis-cell) 或自写 sliding window
- 队列:Redis Streams(P2 起够用,P3 流量大再换 NATS JetStream)
- 缓存 TTL 默认 30 天,LFU 淘汰

### 4.3 对象存储

S3 兼容(AWS S3 / Cloudflare R2 / 阿里云 OSS / MinIO 自部署)。

存原始 PDF/EPUB + 翻译结果。**永不存原文文本**(走数据库)以利全文检索。

### 4.4 不用什么

- 不用 MongoDB(无文档型需求)
- 不用 ClickHouse(用量统计先在 Postgres 做物化视图,P3 再说)
- 不用 Elasticsearch(无搜索需求)

---

## 5. 基础设施 / 部署

### 5.1 容器

Dockerfile 多阶段构建。Go 镜像 distroless(< 30MB),Python 镜像基于 `python:3.12-slim`。

### 5.2 编排

- SaaS 生产:Kubernetes + Helm chart(自维护;托管选 EKS/GKE 都行)
- 自部署:`docker compose up`,一份 compose 文件起 gateway + worker + postgres + redis + minio
- CI:GitHub Actions

### 5.3 可观测性

- 日志:zap (Go) / structlog (Python),JSON,统一 trace id 字段
- 指标:Prometheus + Grafana,关键指标见下表
- 追踪:OpenTelemetry,客户端不接(隐私 + 体积),从 gateway 开始
- 告警:Alertmanager → Slack / 钉钉

| 指标 | 含义 |
|---|---|
| `translate_request_total{provider, status}` | 翻译请求总数 |
| `translate_latency_seconds{provider}` | provider 延迟分布 |
| `cache_hit_ratio` | 共享缓存命中率 |
| `quota_consumed_tokens{plan}` | 各套餐 Token 消耗 |
| `job_duration_seconds{stage}` | 长文档各阶段耗时 |

### 5.4 安全

- 全链路 TLS,gateway 由 nginx/Caddy 终止
- API Key 入库前 AES-GCM 加密,密钥放环境变量(KMS in production)
- CSP:扩展只允许与已配置的 provider/gateway 通信
- Auth:OAuth(GitHub/Google) + 邮箱密码,JWT(短 access + 长 refresh)
- 限流多维:用户 / IP / provider,防止单用户耗尽 provider 配额

---

## 6. 一句话技术栈

**TS + WXT 客户端;Go + chi + Postgres + Redis 网关;Python + LangGraph 异步工作流;S3 兼容对象存储;Docker + K8s 部署。**
