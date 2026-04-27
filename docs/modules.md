# 模块拆分

> 配套文档:[整体架构](architecture.md) · [技术选型](tech-stack.md) · [服务端 API](api.md) · [功能需求](function.md)

按「客户端 / 服务端」分组,每个模块标 P0/P1/P2/P3 与简要职责。优先级与 [function.md](function.md) 末尾的开发优先级对齐。

---

## 一、客户端(浏览器扩展)

### C1. content-script(P0)

注入到每个页面,直接操作 DOM。**唯一与页面 DOM 交互的地方**。

| 子模块 | 职责 | 优先级 |
|---|---|---|
| `dom-walker` | 遍历 DOM,识别可翻译段落,跳过 nav/footer/code/math | P0 |
| `paragraph-id` | 为段落生成稳定 hash id,用于 DOM ↔ 缓存 ↔ 请求关联 | P0 |
| `injector` | 注入双语容器(上下/左右/仅译文),保留原文格式 | P0 |
| `style-engine` | 译文样式(颜色、字号、下划线、虚线、模糊) | P0 |
| `selection-translate` | 划词翻译气泡 | P1 |
| `hover-translate` | 鼠标悬停 + 修饰键触发段落翻译 | P1 |
| `input-enhancer` | 输入框中外语 ↔ 母语翻译 | P1 |
| `subtitle-bridge` | 监听视频字幕轨,转发给 SW | P2 |
| `pdf-viewer` | PDF.js 双语阅读器(打开 *.pdf 时挂载) | P2 |
| `image-ocr-overlay` | 图片悬停 OCR 翻译覆盖层 | P3 |

### C2. service-worker(P0)

MV3 的 background,**所有网络请求与状态管理的中枢**。

| 子模块 | 职责 | 优先级 |
|---|---|---|
| `message-router` | 接收 content/popup/options 消息,统一调度 | P0 |
| `translate-orchestrator` | 缓存查询 → 批量合并 → provider 调用 → 流式回填 | P0 |
| `cache` | IndexedDB 段落缓存(归一化 hash,LRU + TTL) | P0 |
| `provider-adapter` | 各 provider 统一抽象(Google/DeepL/OpenAI/Claude/...) | P0/P1 |
| `rate-limiter` | 客户端侧并发与 QPS 控制 | P0 |
| `quota-tracker` | 本地用量统计(字符/Token) | P0 |
| `auth-client` | SaaS 模式下的登录态 + token 刷新 | P1 |
| `gateway-client` | SaaS 模式下与 gateway 的 SSE/HTTP 通信 | P1 |
| `glossary` | 术语表查询与替换(请求前注入 prompt) | P2 |

### C3. popup(P0)

工具栏弹窗,展示当前页状态、快捷开关。

| 内容 | 优先级 |
|---|---|
| 当前页翻译开关、显示样式切换 | P0 |
| 切换 provider 与目标语言 | P0 |
| 当前页用量、缓存命中率 | P0 |
| 登录入口(SaaS) | P1 |

### C4. options(P0)

完整设置页(独立 tab)。

| 模块 | 职责 | 优先级 |
|---|---|---|
| `general` | 默认目标语言、显示样式、字体、快捷键 | P0 |
| `services` | provider 列表、API Key 管理、降级链 | P0/P1 |
| `rules` | 域名黑白名单、CSS 选择器自定义、永不翻译元素 | P1 |
| `prompts` | AI 翻译风格 / 自定义 prompt / 解释模式 | P1 |
| `glossary-mgr` | 术语表 CRUD、不翻译词列表 | P2 |
| `account` | 订阅、用量、Key 同步 | P1 |
| `import-export` | 设置导入导出 | P2 |

### C5. shared(P0)

跨入口共享代码。

- `i18n` — 扩展自身的多语言
- `storage` — chrome.storage / IndexedDB 统一封装
- `messaging` — 消息协议定义(类型化)
- `crypto` — 本地 Key 加密(用户密码派生)
- `lang-detect` — 语种识别(franc 或类似)

---

## 二、服务端

### S1. gateway(P1,Go)

唯一对外入口。所有客户端流量先到这里。

| 子模块 | 职责 | 优先级 |
|---|---|---|
| `auth` | JWT 验证、API Key 验证、登录/注册/OAuth | P1 |
| `rate-limit` | 基于 Redis 的多维度限流(用户/IP/provider) | P1 |
| `translate-handler` | `/v1/translate` 同步流式接口 | P1 |
| `provider-router` | 路由到具体 provider,失败降级 | P1 |
| `provider-adapter` | 各 provider SDK 适配(与客户端的 adapter 概念相同,但更全) | P1 |
| `cache-layer` | Redis 共享缓存读写 | P1 |
| `usage-meter` | 实时用量计量,异步落盘到 Postgres | P1 |
| `job-handler` | `/v1/jobs/*` 任务接口,创建 + 推队列 | P2 |
| `subtitle-bridge` | SSE 长连接 + 小批量合并 | P2 |
| `webhook` | 计费 webhook(Stripe/支付宝) | P1 |

### S2. workflow-worker(P2,Python + LangGraph)

异步任务消费者。**不直接对外**。

| 子模块 | 职责 | 优先级 |
|---|---|---|
| `doc-pipeline` | PDF/EPUB:解析 → 分章节 → 顺序译 → 重排版 | P2 |
| `glossary-extractor` | 自动从文档抽取术语 + 一致性维护 | P2 |
| `subtitle-pipeline` | SRT/VTT/ASS 文件批量翻译 | P2 |
| `ocr-pipeline` | 图像 → 版面 → 文字 → 译 → 渲染 | P3 |
| `multi-model-vote` | 并行 N 模型 → 评分 → 选优 | P3 |
| `academic-mode` | 抽术语 → 译 → 自校对 → 反向回译 | P3 |
| `checkpointer` | LangGraph state 落 Postgres,支持断点续传 | P2 |

### S3. storage 服务封装(P1)

不是独立服务,是 gateway / worker 共用的 SDK 层。

- `db` — Postgres(用户、订阅、用量、术语表、job 元数据)
- `redis` — 缓存 + 限流 + 队列(初期用 Redis Stream,规模大了换 NATS)
- `objstore` — S3 兼容(原始 PDF/EPUB、翻译结果)

### S4. billing(P1)

| 子模块 | 职责 | 优先级 |
|---|---|---|
| `subscription` | 订阅状态、套餐、续费 | P1 |
| `metering` | Token 计量、成本估算、配额扣减 | P1 |
| `payment` | Stripe / 支付宝 集成 | P1 |
| `invoice` | 账单生成 | P3 |

### S5. config-sync(P1)

跨设备同步用户配置(术语表、规则、prompt)。HTTP CRUD,不需要实时性。

### S6. ops / observability(P1)

- `logging` — 结构化日志(zap)
- `metrics` — Prometheus 指标
- `tracing` — OpenTelemetry,贯穿 gateway → worker
- `health` — `/healthz` `/readyz`

---

## 三、阶段映射

### P0 — MVP(纯客户端)
- C1.dom-walker / paragraph-id / injector / style-engine
- C2.message-router / translate-orchestrator / cache / provider-adapter (Google + DeepL) / rate-limiter / quota-tracker
- C3.popup 基础
- C4.options general + services
- C5.shared 全部

**目标**:用户装上扩展,自带 Google/DeepL Key,能看到网页双语翻译 + 缓存命中。

### P1 — SaaS + AI
- 服务端从零搭建:S1.gateway(全部 P1) + S3.storage + S4.billing + S6.ops
- 客户端补 C1.selection/hover/input、C2.auth-client/gateway-client、C4.rules/prompts/account
- provider 扩展:OpenAI / Claude / Gemini / DeepSeek

**目标**:上线 SaaS,用户登录后无需自己管 Key,按量付费。

### P2 — 长文档 + 字幕
- 引入 S2.workflow-worker(doc-pipeline + glossary-extractor + subtitle-pipeline + checkpointer)
- 客户端补 C1.subtitle-bridge / pdf-viewer、C2.glossary、C4.glossary-mgr

**目标**:PDF/EPUB 翻译、视频字幕双语化、术语表全链路。

### P3 — 高级
- S2 扩展(OCR / 多模型投票 / academic mode)
- C1.image-ocr-overlay、C4.import-export、C5.config-sync

**目标**:差异化竞争力。
