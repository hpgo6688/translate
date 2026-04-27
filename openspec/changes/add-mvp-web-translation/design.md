## Context

仓库目前是 greenfield,只有 [docs/](../../../docs/) 下的设计文档。本 change 是项目落地的第一刀,完成后才会有 `package.json` 和源码。所有跨切面的技术栈选型(WXT、React、Zustand、Dexie、@webext-core/* 等)已经在 [docs/technology-stack.md](../../../docs/technology-stack.md) 与 [docs/tech-stack.md](../../../docs/tech-stack.md) 锁定,本文档不重复,只聚焦 P0 MVP 范围内的**架构决策**。

## Goals / Non-Goals

**Goals:**
- 网页双语翻译在 Chrome / Edge / Firefox 上稳定可用,Shadow DOM 隔离让译文 UI 不被宿主样式污染
- DOM 注入与缓存配合达到 ≥ 70% 段落命中率(同页面二次打开)
- Provider 抽象层在 P0 落地后能被 P1 网关复用,无需重构
- 整个 content script 注入体积控制在 ≤ 150KB(gzip)
- 用户自带 Google / DeepL 免费 Key 即可使用,Key 在本地 AES-GCM 加密存储

**Non-Goals:**
- 服务端任何能力(留给 P1)
- AI Provider(OpenAI/Claude/Gemini,留给 P1)
- 划词、悬停、输入框、字幕、PDF/EPUB、OCR(各自后续 change)
- 远程同步、账号、计费(P1+)
- 性能优化的极致打磨(MVP 跑通即可,数据驱动后续优化)

## Decisions

### D1. 内容脚本 UI 用 React + Shadow DOM,不用 iframe

- **选择**:WXT `createShadowRootUi` + React 18 `createRoot` 挂载到 Shadow Root
- **替代**:① iframe 完全隔离 ② 原生 DOM + 内联样式
- **理由**:Shadow DOM 在样式隔离上等同 iframe,但能直接访问宿主 DOM(注入译文必须),性能更好;原生 DOM 在交互式 UI(浮动按钮、设置弹层)上开发效率太低。Shadow DOM 的局限(继承字体)由我们主动注入 reset 解决
- **代价**:某些极端老旧网站对 Shadow DOM 的事件冒泡有特殊处理,需要做兼容测试

### D2. 段落 ID 用「归一化文本 hash」而非 DOM 路径

- **选择**:`hash(normalize(text))`,其中 `normalize` 去除多余空白、统一首尾标点;hash 用 SHA-1 截前 16 字节(Base64URL)
- **替代**:① DOM 路径(`body>div:nth-of-type(2)>p:nth-of-type(5)`) ② 自增 ID
- **理由**:DOM 路径在 SPA 重新渲染、广告插入后立刻失效;归一化文本 hash 让相同文本无论在何位置出现都命中同一缓存,P1 共享缓存(跨用户)也能复用同一 key 规则
- **代价**:相同文本在同页多次出现需要二级 ID 区分(占位符 `${hash}#${index}`)

### D3. 所有 Provider 调用集中在 service worker,content script 不直接发请求

- **选择**:content script → SW(`@webext-core/messaging`) → Provider API
- **替代**:content script 直接 `fetch`
- **理由**:① 统一处理 CORS、超时、限流 ② Key 不进 content script 内存,降低 XSS 影响面 ③ 缓存读写只在 SW,无锁问题 ④ 与 P1 切到网关时只动 SW 一处
- **代价**:多一次消息跳转(可忽略,SW 与 content script 都在浏览器进程内)

### D4. Provider 抽象接口面向「可流式」设计,即使 P0 的 Google/DeepL 不流式

- **选择**:接口签名 `translate(segments, opts): AsyncIterable<{id, text, done}>`
- **替代**:`translate(segments) => Promise<{id, text}[]>`
- **理由**:P1 接入 OpenAI/Claude 必然要流式;现在按流式定义,Google/DeepL 适配器内部一次性返回再 yield 即可,反向适配代价为零;反过来后期再改是 breaking change
- **代价**:无 —— 这是免费的前向兼容

### D5. Key 加密:用户密码派生 + WebCrypto AES-GCM,不存明文

- **选择**:用户首次启用 SaaS-disabled 模式时设置一个本地密码;PBKDF2(密码, 盐, 200k 轮) → AES-GCM 256 密钥 → 加密 Provider Key 后存 `chrome.storage.local`
- **替代**:① 明文存储 ② 浏览器 unlock 时无需密码,密钥直接派生自固定字符串
- **理由**:扩展场景的威胁模型主要是「他人物理接触设备 / 偷取 storage 文件」;固定派生等同明文。要求密码会损失一点便利性,但 MVP 阶段安全优先
- **代价**:用户每次浏览器重启需输入一次密码解锁(密钥放 SW 内存,不持久化)
- **开放点**:是否提供「记住 7 天」选项 → P1 再说

### D6. 缓存 schema 在 v1 就预留版本字段

- **选择**:Dexie 表行带 `schemaVersion: 1`;读出时若版本不匹配视为未命中
- **替代**:无版本,后续靠 migration 升级
- **理由**:缓存数据无业务价值,丢了用户最多体感「需要重新翻译一次」,远比 migration 出错风险低
- **代价**:无

### D7. Zustand,但**不**做跨上下文 store 同步

- **选择**:popup / options 各自独立 Zustand store + persist 中间件;真正的跨上下文同步通过 `chrome.storage.onChanged` 事件触发各自 store 的 setter
- **替代**:① 共享 store(类似 [webext-redux](https://github.com/tshaddix/webext-redux)) ② 完全无 store
- **理由**:扩展三个上下文(content / SW / popup-options)生命周期独立,共享 store 的代价(每次 action 都跨进程)远大于收益。`chrome.storage` 本来就是真相源,store 只做本地视图
- **代价**:轻微数据延迟(< 50ms),可接受

### D8. 段落级流式注入,不等全部翻译完成

- **选择**:Provider 适配器返回 `AsyncIterable`;SW 按段 `runtime.sendMessage` 给 content script;content script 收到一段就注入一段
- **替代**:批量请求 → 一次性回填
- **理由**:用户体感比总耗时更重要;长文章前 5 段译文先出现比「等 8 秒后整页出现」体验好得多
- **代价**:DOM 写入次数变多(用 `requestAnimationFrame` 合批可缓解)

### D9. 客户端限流在 SW 实现,而非各 Provider 适配器内

- **选择**:SW 中一个全局 `p-queue` 实例,Provider 适配器只负责调用,限流由编排层控制
- **替代**:每个适配器自带限流
- **理由**:用户切换 Provider 时不应有「一冷一热」的不一致感;且未来要加全局并发上限(防止 100 个 tab 同时翻译压垮浏览器)集中位置更易做
- **代价**:不同 Provider 的限流参数差异需要在编排层做映射(`provider.limits` 字段)

### D10. 浮动一键翻译按钮:可关闭、跟随域名规则

- **选择**:默认显示,固定右下角;options 可全局关闭;后续 change 加域名级开关
- **替代**:默认不显示,只有快捷键 / 弹窗触发
- **理由**:用户首次安装最大的痛点是「不知道怎么用」,可见的按钮就是最强的引导
- **代价**:某些网站右下角已被占用(客服悬浮、回到顶部),需要测试覆盖并在 options 提供「位置」选项 → 暂不做,P1 再说

## Risks / Trade-offs

| 风险 | 缓解 |
|---|---|
| MV3 service worker 休眠丢状态 | 关键状态(用量、密钥解锁态)写 IndexedDB / 内存均可,但解锁态故意只放内存 —— 休眠后需重新解锁,符合安全期望 |
| Google / DeepL 免费接口被限流甚至关停 | 客户端做指数退避;options 显示「Provider 不可用」状态;给用户清晰的失败提示而不是静默失败 |
| Shadow DOM 与 SPA 频繁 DOM 重建冲突 | MutationObserver 节流(200ms debounce),只观察特定根节点,跳过我们自己注入的容器 |
| React + Tailwind 在 content script 体积 | 代码分割:浮动按钮和翻译核心在主 bundle,设置类 UI 走 options 页;若上线后 gzip > 150KB 再评估 Preact 切换 |
| 跨浏览器(Firefox 对 MV3 的支持差异) | WXT 已抽象大部分;CI 在 Chrome / Firefox 各跑一次 Playwright |
| 缓存 schema 演进 | 已经在 D6 决策预留版本字段 |
| 段落 hash 碰撞 | SHA-1 16 字节空间足够大,且 hash 仅用于「同段落是否已翻译过」,碰撞最坏后果是错把 A 的译文显示为 B,概率约 1e-19,接受 |
| 用户忘记本地密码 | 提供「重置」选项 —— 重置即清空所有 Provider Key,用户重新输入 |

## Migration Plan

不适用,这是首次发布。

## Open Questions

1. **缓存 TTL 默认值**:30 天?7 天?太长会让翻译过的网页内容更新后看到旧译文。**暂定 30 天**,在 options 提供清空按钮,运行一段时间收集反馈
2. **段落最小字符数阈值**:多短的段落不值得翻译(避免单词、纯数字)?**暂定 ≥ 4 个字符 + 至少包含 1 个字母**
3. **Vendor 内置 Key**:是否给 Google 翻译这种半公开的免费接口内置一个共享 Key 让用户开箱即用?**否** —— 滥用风险高,坚持「自带 Key」原则
4. **浮动按钮在 iframe 子页面是否显示**:**否**,只在 top frame 注入,避免重复 UI
