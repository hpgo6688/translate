## 1. 项目骨架与工具链

- [x] 1.1 用 `pnpm dlx wxt@latest init` 初始化 React + TS 模板,目录调整为 [docs/technology-stack.md](../../../docs/technology-stack.md) 第三节布局
- [x] 1.2 配置 `wxt.config.ts`:目标浏览器 chrome / firefox,Manifest V3,加载 `@wxt-dev/module-react`
- [x] 1.3 配置 `tsconfig.json`(strict、`noUncheckedIndexedAccess`)与路径别名(`@/*`)
- [x] 1.4 配置 Tailwind + 在 Shadow DOM 内生效(参考 WXT 官方 Tailwind 集成指南)
- [x] 1.5 安装 [docs/technology-stack.md](../../../docs/technology-stack.md) 第五节列出的运行时依赖与 dev 依赖
- [x] 1.6 接入 shadcn/ui CLI,落 `components/ui/` 基础组件(button / input / select / switch / dialog)
- [x] 1.7 配置 ESLint + Prettier + Husky pre-commit
- [x] 1.8 配置 Vitest(jsdom 环境),写一个 sanity 测试跑通
- [x] 1.9 配置 Playwright,加载未打包扩展跑一个 sanity E2E
- [x] 1.10 配置 GitHub Actions:install → typecheck → lint → vitest → build(暂不在 CI 跑 Playwright,本地可跑即可)

## 2. 共享基础设施

- [x] 2.1 `utils/messaging.ts`:基于 `@webext-core/messaging` 定义类型化消息 schema(`TRANSLATE_BATCH` / `SETTINGS_CHANGED` / `NEEDS_UNLOCK` / `UNLOCK_RESULT`)
- [x] 2.2 `utils/storage.ts`:封装 `chrome.storage.local` / `chrome.storage.sync` 的类型化读写,基于 `@webext-core/storage`
- [x] 2.3 `utils/normalize.ts`:Unicode NFC + 空白合并 + 首尾 trim + SHA-1 截 16 字节 Base64URL hash 的 `normalize` 与 `paragraphId` 函数,**先写单元测试再实现**
- [x] 2.4 `utils/crypto.ts`:WebCrypto AES-GCM 256 + PBKDF2 200k 轮密钥派生,提供 `deriveKey(password, salt)` / `encrypt(key, plaintext)` / `decrypt(key, ciphertext, iv)`,带单元测试覆盖错误密码 / 数据篡改
- [x] 2.5 `utils/lang-detect.ts`:基于 `franc-min` 的语种识别,提供 `detect(text): string | 'und'`
- [x] 2.6 `locales/zh-CN.json` 与 `locales/en.json` 初始词条;`utils/i18n.ts` 配置 i18next 默认从 `chrome.i18n.getUILanguage()` 取语言,带 options 覆盖

## 3. 翻译缓存(translation-cache)

- [x] 3.1 定义 Dexie 数据库 `core/cache/db.ts`:`paragraphs` 表,字段 `key / translation / provider / sourceLang / targetLang / createdAt / lastHitAt / hitCount / schemaVersion=1`,`key` 上唯一索引
- [x] 3.2 实现 `lookup(keys: string[]): Promise<Map<string, CacheRecord | null>>`,单事务批量读取
- [x] 3.3 实现 `put(record): Promise<void>` 与 `putMany(records): Promise<void>`(覆盖式写入)
- [x] 3.4 命中后异步更新 `lastHitAt` / `hitCount`,5 秒内合批落盘(用 `requestIdleCallback` 或 `setTimeout` 定时 flush)
- [x] 3.5 实现 LRU + TTL 后台扫表清理:每小时跑一次 + 安装/升级时跑一次,可被 options 触发立即清理
- [x] 3.6 滚动窗口命中率计数器(每 Provider 独立,最近 1000 次 lookups),暴露给 popup 与 options
- [x] 3.7 Vitest 用例:schema version mismatch 视为 miss、归一化 key 命中、bulk lookup 单事务、TTL 过期、LRU 淘汰

## 4. Provider 抽象(provider-abstraction)

- [x] 4.1 `core/translators/base.ts`:定义 `TranslateProvider` interface(签名见 spec),错误类型(`UNSUPPORTED_LANG_PAIR` / `PROVIDER_KEY_MISSING` / `QUOTA_EXCEEDED` / `AUTH_FAILED` / `PROVIDER_FAILED`)
- [x] 4.2 `core/translators/google.ts`:免费端点适配,支持 `auto` 源语言;非流式底层 → AsyncIterable(全部就绪后一次性 yield)
- [x] 4.3 `core/translators/deepl.ts`:Free API 端点,Key 必填,`limits.qps = 5`,处理 HTTP 456 → `QUOTA_EXCEEDED`
- [x] 4.4 `core/translators/index.ts`:Provider 注册表 + 根据 id 取实例
- [x] 4.5 `core/keystore/master-password.ts`:首次设置密码、解锁、重置(清空所有加密 Key)
- [x] 4.6 `core/keystore/provider-keys.ts`:Provider Key 加密读写;解密后的 Key 仅在 SW 内存中,SW 休眠丢失后下次访问自动发 `NEEDS_UNLOCK`
- [x] 4.7 Vitest 用例:Google auto 检测、DeepL 缺 Key 抛 `PROVIDER_KEY_MISSING`、Provider 抽象的 Abort 行为、加密 Key 错误密码失败、Provider 配置变更通过 `chrome.storage.onChanged` 1s 内可见

## 5. 翻译编排(translate-orchestration)

- [x] 5.1 `entrypoints/background.ts`:消息路由器主入口,挂接 `@webext-core/messaging` 处理器
- [x] 5.2 `core/orchestrator/cache-filter.ts`:输入段落 → 先查缓存 → 拆分 hit / miss
- [x] 5.3 `core/orchestrator/batcher.ts`:cache-miss 段落按 50 条 / 4000 字符 / 100ms debounce 三条件合批
- [x] 5.4 `core/orchestrator/queue.ts`:基于 `p-queue` 全局并发 4、默认 QPS 10、队列上限 50,超限抛 `RATE_LIMITED_LOCAL`
- [x] 5.5 `core/orchestrator/retry.ts`:基于 `p-retry`,指数退避 1s/2s/4s,最多 3 次,只对 5xx / 429 / 网络错误重试
- [x] 5.6 `core/orchestrator/streamer.ts`:消费 Provider AsyncIterable,每 yield 一段就 `runtime.sendMessage` 推给请求源 Tab(段 id 对齐 DOM)
- [x] 5.7 `core/usage/meter.ts`:Provider 维度的字符 / 请求 / 成功 / 失败计数,IndexedDB 持久化,跨 SW 重启不丢
- [x] 5.8 月度滚动:计数读取时按当前月份 key,历史月数据保留可查
- [x] 5.9 Vitest 用例:批合并阈值、流式回填顺序无关、限流上限拒绝、5xx 重试 / 401 不重试、月度切换计数归零

## 6. 内容脚本(web-page-translation)

- [x] 6.1 `entrypoints/content.tsx`:`defineContentScript` matches `<all_urls>`,`cssInjectionMode: 'ui'`,顶部 frame only
- [x] 6.2 `core/dom/walker.ts`:遍历 DOM 识别可翻译段落,跳过规则按 spec(nav/footer/header/aside/script/style/code/pre/math/translate=no/notranslate);最短 4 字符 + 至少 1 个字母过滤
- [x] 6.3 `core/dom/paragraph-id.ts`:同段落多次出现的二级 ID(`<hash>#<index>`),保证扫描内顺序稳定
- [x] 6.4 `core/dom/injector.ts`:三种显示模式(below / side-by-side / replace),保留内联格式标签(`<a>` / `<em>` / `<strong>` / `<code>`)
- [x] 6.5 `core/dom/style-engine.ts`:CSS 变量驱动颜色 / 字号 / 装饰 / 模糊;options 改动通过 `chrome.storage.onChanged` → CSS 变量更新,200ms 内生效
- [x] 6.6 `core/dom/shadow-host.ts`:用 `createShadowRootUi` 为每条注入译文创建独立 Shadow root;reset CSS + Tailwind 编译进 Shadow root
- [x] 6.7 `core/dom/viewport.ts`:`IntersectionObserver`(rootMargin 200px)按需提交翻译
- [x] 6.8 `core/dom/observer.ts`:`MutationObserver` 200ms debounce,过滤掉自身 Shadow root 内的变更,避免反馈循环
- [x] 6.9 `entrypoints/content/floating-button.tsx`:右下角浮动按钮,Shadow DOM 渲染,关闭按钮(per-page,刷新即恢复)
- [x] 6.10 Vitest 用例(jsdom):跳过规则 / 段落 ID 稳定性 / 短文本拒绝 / 内联格式保留;Playwright 用例:浮动按钮点击 → 双语注入

## 7. Popup(extension-ui)

- [x] 7.1 `entrypoints/popup/main.tsx`:React 入口,挂载 `<App />`,注入 i18next provider
- [x] 7.2 `stores/popup.ts`:Zustand + persist;字段:Tab 启用、目标语言、Provider id;订阅 `chrome.storage.onChanged`
- [x] 7.3 Tab 启用 toggle、目标语言下拉、Provider 下拉(仅展示已启用 Provider)、用量行(本会话字符 / 当前 Provider 命中率)、Options 入口链接
- [x] 7.4 toggle on 后 500ms 内 content script 开始翻译可视段落(端到端验证)

## 8. Options(extension-ui)

- [x] 8.1 `entrypoints/options/main.tsx`:React 入口 + 路由(general / display / shortcuts / providers / cache / about)
- [x] 8.2 `stores/settings.ts`:Zustand + persist;每张表单用 `react-hook-form` + `zod` schema 校验,非法值不持久化
- [x] 8.3 General:默认源 / 目标语言、默认 Provider、master enable
- [x] 8.4 Display:bilingual 模式三选一、颜色、字号(50–150)、装饰、模糊
- [x] 8.5 Shortcuts:`chrome.commands` 集成,默认 `Alt+A`,冲突时降级提示
- [x] 8.6 Providers:Provider 列表 enable / disable;Key 输入(触发 master password unlock 流);Default Provider 选择
- [x] 8.7 Cache:TTL(1–365 天)、LRU 上限(1k–1M)、按 Provider / 语言对 / 全部 三种粒度的清理按钮
- [x] 8.8 About:版本号、文档链接

## 9. 跨上下文同步与解锁流

- [x] 9.1 SW 检测到内存中无 master key 但有加密 Key 时,广播 `NEEDS_UNLOCK`
- [x] 9.2 popup 收到 `NEEDS_UNLOCK` 自动弹解锁对话框;options 收到时在顶部 banner 显示解锁入口
- [x] 9.3 `UNLOCK_RESULT` 成功后 SW 缓存派生密钥到内存,继续未完成翻译
- [x] 9.4 `chrome.storage.onChanged` → 1 秒内 popup / options / content script 收敛(端到端测一次)

## 10. 端到端冒烟与发布

- [ ] 10.1 Playwright E2E:加载扩展 → 打开 `tests/fixtures/article.html` → 点浮动按钮 → 校验 ≥ 5 段双语注入 → 切换 Provider → 校验切换后续段落用新 Provider
- [ ] 10.2 Playwright E2E:Options 改 display mode 为 side-by-side,1s 内已注入译文重新排版
- [ ] 10.3 Playwright E2E:输入错误 master password 显示通用错误,不泄漏哪些 Provider 已配
- [ ] 10.4 体积检查:content script 主 bundle gzip ≤ 150KB(`pnpm build` 后人工核对,记录到 README)
- [ ] 10.5 跨浏览器验证:`pnpm build:firefox` 在 Firefox Nightly 跑 fixture 页确认浮动按钮 + 翻译流程通过
- [ ] 10.6 写最简 README(开发命令 + 加载未打包扩展步骤 + 本 change 范围)
- [ ] 10.7 `pnpm zip` 产出 chrome / firefox 商店包,人工试装一次,确认能正常运行
- [ ] 10.8 `openspec status --change add-mvp-web-translation` 全部 done 后,准备 archive
