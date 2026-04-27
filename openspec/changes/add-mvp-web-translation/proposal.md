## Why

我们要做一个 Immersive Translate 类的浏览器扩展。整体路线已经在 [docs/architecture.md](../../../docs/architecture.md) 第 8 节确定:**P0 阶段不引入服务端**,先用纯客户端跑通最核心的网页双语翻译循环,验证 DOM 注入策略、缓存命中率、Provider 抽象的合理性,再于 P1 引入 Go 网关 + SaaS。本次 change 交付 P0 MVP,目标是「装上扩展、自带 Google/DeepL Key、能在任意网页看到稳定的双语对照译文」。

## What Changes

- 新建 WXT + React + TypeScript 项目骨架,跨 Chrome / Edge / Firefox(MV3) 一份代码
- Content script:DOM 段落识别(跳过导航/页脚/代码/数学公式)、稳定段落 hash ID、双语注入(上下/左右/仅译文)、样式引擎(颜色/字号/下划线/虚线/模糊),全部通过 `createShadowRootUi` Shadow DOM 隔离
- Service worker:消息路由、翻译编排器(缓存查询 → 批量合并 → Provider 调用 → 流式回填)、客户端限流、本地用量统计
- Provider 抽象层 + Google(免费)、DeepL(免费)两个实现;Key 通过 WebCrypto AES-GCM(用户密码派生)加密存储
- IndexedDB 缓存(Dexie):归一化文本 hash 作为 key,LRU + TTL,采集命中率指标
- Popup(Zustand):当前 Tab 翻译开关、目标语言切换、Provider 切换、用量展示
- Options 页:默认目标语言、显示样式、字体、快捷键、Provider 列表、Key 管理
- 页面浮动一键翻译按钮
- 类型安全消息总线(`@webext-core/messaging`)
- i18n(i18next):zh-CN、en
- Vitest 单测覆盖:DOM walker、段落 hash 稳定性、缓存归一化、Provider 适配器契约
- Playwright 冒烟 E2E:加载扩展 → 打开 fixture 页 → 点击翻译 → 验证双语输出

**显式不在本 change 范围内**(留给后续 change):划词翻译、悬停翻译、输入框增强、AI Provider(OpenAI/Claude/Gemini)、SaaS 网关、账号/认证、计费、术语表、域名规则引擎、PDF/EPUB、字幕、OCR、多模型投票、云同步。

## Capabilities

### New Capabilities

- `web-page-translation`: 网页 DOM 解析、可翻译段落识别(跳过 nav/footer/code/math)、稳定段落 ID 生成、双语注入(三种显示模式)、样式引擎,全部在 Shadow DOM 隔离层内
- `translate-orchestration`: service worker 中的消息路由、翻译编排(缓存查询 → 批量合并 → Provider 调用 → 流式回填)、客户端限流、本地用量统计
- `provider-abstraction`: 统一 Provider 接口、Google / DeepL 免费引擎实现、Key 加密存储(WebCrypto AES-GCM,密码派生)、Provider 配置管理
- `translation-cache`: IndexedDB(Dexie)段落缓存,归一化文本 hash 作为 key,LRU + TTL,命中率指标采集
- `extension-ui`: popup(Tab 开关 + 切语言 + 切 Provider + 用量)、options(全部设置项)、页面浮动一键翻译按钮、i18n、跨上下文状态同步

### Modified Capabilities

无 —— 当前是项目初始 change,仓库内没有既有 spec。

## Impact

- **新建代码**:整个 `entrypoints/`、`components/`、`core/`、`stores/`、`hooks/`、`utils/`、`locales/` 目录结构(参考 [docs/technology-stack.md](../../../docs/technology-stack.md) 第三节)
- **新增依赖**:见 [docs/technology-stack.md](../../../docs/technology-stack.md) 第五节(运行时:react / zustand / dexie / @webext-core/* / ofetch / p-queue / p-retry / react-hook-form / zod / i18next / lucide-react;开发:wxt / @wxt-dev/module-react / typescript / tailwindcss / vitest / @playwright/test / eslint / prettier)
- **配置文件**:`wxt.config.ts`、`tailwind.config.ts`、`tsconfig.json`、`package.json`(pnpm)、`.eslintrc`、`.prettierrc`
- **CI**:GitHub Actions 跑 typecheck + vitest + playwright + build
- **后续 change 的接口契约**:本 change 落地的 Provider 抽象接口将被 P1 的 `add-saas-gateway` 复用(客户端调网关时复用同一抽象);缓存 schema、消息协议、Provider 配置结构都会成为后续 change 的稳定接口
- **不影响**:无服务端、无远程数据,用户安装后离线即可工作(除调用 Provider API 本身)
