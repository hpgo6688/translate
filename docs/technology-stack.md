# Immersive Translate 类浏览器插件 - 技术栈方案（WXT + React）

## 一、核心技术栈

```
框架：WXT
UI（Content Script 注入 + Popup + Options）：React 18 + TypeScript
样式：Tailwind CSS / UnoCSS（Content Script 注入需配合 Shadow DOM）
状态管理：Zustand
存储：chrome.storage（配置）+ IndexedDB / Dexie.js（翻译缓存）
通信：@webext-core/messaging
打包：Vite（WXT 内置）
测试：Vitest + Playwright
代码规范：ESLint + Prettier + Husky
包管理：pnpm（推荐 monorepo）
```

---

## 二、技术栈详解

### 2.1 框架层：WXT
- 基于 Vite，HMR 极快
- 一套代码同时构建 Chrome / Edge / Firefox / Safari
- 自动处理 Manifest V2/V3 兼容
- 文件路由式开发（`entrypoints/` 目录约定）
- 内置 TypeScript 支持
- 内置 `@wxt-dev/module-react` 模块，开箱即用支持 React

### 2.2 UI 层：React 18 + TypeScript
- **Popup 页**：扩展工具栏点击弹窗，React 组件化开发
- **Options 页**：完整设置页面，复杂表单用 React Hook Form
- **Content Script UI**：通过 WXT 的 `defineContentScript` + `createShadowRootUi` 注入，避免污染宿主页面
- **PDF Reader 页**：独立 extension page，用 PDF.js + React 渲染

### 2.3 样式方案：Tailwind CSS（推荐）
- 配合 Shadow DOM 隔离，避免与宿主页面样式冲突
- WXT 提供 `@wxt-dev/module-react` + Tailwind 配置模板
- 备选 UnoCSS：体积更小，按需生成，适合内容脚本

### 2.4 UI 组件库（可选）
- **shadcn/ui**：复制粘贴式组件，零运行时依赖，适合插件
- **Radix UI**：无样式可访问性组件，shadcn 底层
- **Ant Design**：功能全但体积大，适合 Options 页
- 推荐 **shadcn/ui**，灵活且体积可控

### 2.5 状态管理：Zustand
- 轻量（~1KB），适合插件场景
- 跨 popup / options / content script 的状态需通过 chrome.storage 同步
- 配合 `zustand/middleware` 的 persist 中间件持久化

### 2.6 存储方案
- **chrome.storage.local**：用户配置、API Keys、网站规则
- **chrome.storage.sync**：需要跨设备同步的轻量配置（受 100KB 限制）
- **IndexedDB（Dexie.js 封装）**：翻译缓存、术语表、单词本（大数据量）
- **@webext-core/storage**：类型安全的 chrome.storage 封装

### 2.7 跨上下文通信：@webext-core/messaging
- 类型安全的消息传递
- 简化 background ↔ content ↔ popup 三方通信
- 替代手写 `chrome.runtime.sendMessage`

### 2.8 翻译服务调用层
- **自建抽象层**：统一不同翻译服务的接口（Google/DeepL/OpenAI/Claude...）
- **ofetch / ky**：现代 fetch 封装，处理重试、超时
- **p-queue**：控制并发请求数
- **p-retry**：失败重试

---

## 三、项目结构（基于 WXT 约定）

```
immersive-translate-clone/
├── entrypoints/                    # WXT 入口目录（约定式）
│   ├── background.ts              # Service Worker
│   ├── content.tsx                # 内容脚本（注入网页）
│   ├── popup/                     # 工具栏弹窗
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── App.tsx
│   ├── options/                   # 设置页
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── App.tsx
│   └── pdf-reader/                # PDF 阅读器页面
│       ├── index.html
│       └── main.tsx
├── components/                     # 共享 React 组件
│   ├── ui/                        # shadcn/ui 组件
│   ├── TranslateBubble.tsx        # 划词翻译气泡
│   ├── BilingualParagraph.tsx     # 双语段落
│   └── SettingsPanel.tsx
├── core/                           # 核心业务逻辑
│   ├── translators/               # 翻译服务抽象层
│   │   ├── base.ts               # 抽象基类
│   │   ├── google.ts
│   │   ├── deepl.ts
│   │   ├── openai.ts
│   │   ├── claude.ts
│   │   └── index.ts              # 工厂方法
│   ├── dom/                       # DOM 解析与操作
│   │   ├── parser.ts             # 段落识别
│   │   ├── injector.ts           # 译文注入
│   │   └── observer.ts           # IntersectionObserver
│   ├── cache/                     # 翻译缓存
│   │   └── db.ts                 # Dexie 数据库
│   └── rules/                     # 网站规则引擎
│       └── matcher.ts
├── stores/                         # Zustand 状态
│   ├── settings.ts
│   ├── translation.ts
│   └── usage.ts
├── hooks/                          # React Hooks
│   ├── useTranslate.ts
│   ├── useSettings.ts
│   └── useShadowRoot.ts
├── utils/                          # 工具函数
│   ├── messaging.ts              # 跨上下文通信
│   ├── storage.ts
│   └── i18n.ts
├── locales/                        # 多语言
│   ├── zh-CN.json
│   ├── en.json
│   └── ja.json
├── public/                         # 静态资源
│   └── icons/
├── wxt.config.ts                  # WXT 配置
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 四、关键技术挑战与方案

### 4.1 Content Script 样式隔离
**挑战**：注入到第三方网页的 UI 不能被宿主样式污染

**方案**：
- 使用 WXT 的 `createShadowRootUi` 创建 Shadow DOM
- Tailwind CSS 编译进 Shadow DOM 内部
- React 通过 `createRoot` 挂载到 Shadow Root

```typescript
// 伪代码示意
export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'translate-ui',
      position: 'inline',
      onMount: (container) => {
        const root = ReactDOM.createRoot(container);
        root.render(<TranslateApp />);
        return root;
      },
    });
    ui.mount();
  },
});
```

### 4.2 段落级双语翻译性能
**挑战**：长文章可能上千段落，全量翻译卡顿且消耗 Token

**方案**：
- IntersectionObserver 监听可视区域，按需翻译
- 翻译结果 IndexedDB 缓存（hash 原文为 key）
- 段落合并请求（多段拼接成一次 API 调用）
- p-queue 控制并发数

### 4.3 Manifest V3 Service Worker 限制
**挑战**：Service Worker 无 DOM、会休眠、无 setTimeout（长时）

**方案**：
- 翻译请求集中在 Service Worker（避免 CORS）
- 使用 `chrome.alarms` 替代长时定时器
- 状态持久化到 chrome.storage，避免休眠丢失

### 4.4 React 在 Content Script 的体积优化
**挑战**：每个网页注入 React + 业务代码可能 100KB+

**方案**：
- Vite 代码分割，按需加载（划词翻译 UI 懒加载）
- 考虑 Preact 替换 React（API 兼容，体积仅 3KB）
- 重量级 UI（设置面板）走 Options 页，不注入

### 4.5 跨上下文通信
**挑战**：popup / content / background 三方状态同步

**方案**：
- 翻译请求统一走 background（Service Worker）
- chrome.storage.onChanged 监听配置变化，各上下文同步
- @webext-core/messaging 类型安全调用

---

## 五、推荐依赖列表

### 核心依赖
```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "zustand": "^4.5.0",
    "dexie": "^4.0.0",
    "@webext-core/messaging": "^2.0.0",
    "@webext-core/storage": "^1.2.0",
    "ofetch": "^1.3.0",
    "p-queue": "^8.0.0",
    "p-retry": "^6.2.0",
    "react-hook-form": "^7.51.0",
    "zod": "^3.23.0",
    "i18next": "^23.11.0",
    "react-i18next": "^14.1.0",
    "lucide-react": "^0.379.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.3.0"
  },
  "devDependencies": {
    "wxt": "^0.19.0",
    "@wxt-dev/module-react": "^1.1.0",
    "typescript": "^5.4.0",
    "tailwindcss": "^3.4.0",
    "vitest": "^1.6.0",
    "@playwright/test": "^1.44.0",
    "eslint": "^9.0.0",
    "prettier": "^3.2.0"
  }
}
```

### 文档与文件翻译相关
```json
{
  "pdfjs-dist": "^4.0.0",      // PDF 渲染
  "epubjs": "^0.3.0",           // EPUB 解析
  "subsrt-ts": "^2.0.0"         // 字幕格式解析
}
```

### AI 服务 SDK（可选，也可直接用 fetch）
```json
{
  "openai": "^4.47.0",
  "@anthropic-ai/sdk": "^0.21.0"
}
```

---

## 六、开发工作流

### 6.1 启动开发
```bash
pnpm install
pnpm dev          # Chrome 开发模式
pnpm dev:firefox  # Firefox 开发模式
```

### 6.2 构建发布
```bash
pnpm build        # Chrome/Edge 构建
pnpm build:firefox
pnpm zip          # 打包成商店上传文件
```

### 6.3 浏览器调试
- WXT 自动启动浏览器并加载扩展
- 内容脚本支持 HMR 热更新
- React DevTools 可在 popup/options 中使用

---

## 七、起步建议

**第一步**：初始化项目
```bash
pnpm dlx wxt@latest init immersive-translate-clone -t react-ts
```

**第二步**：装上 Tailwind + shadcn/ui
- WXT 官方文档有 Tailwind 集成指南
- shadcn/ui 直接用 CLI 添加组件

**第三步**：搭建翻译服务抽象层
- 先实现 Google 免费接口跑通双语翻译
- 再扩展 OpenAI / Claude

**第四步**：MVP 功能闭环
- 网页双语翻译 + 一键按钮 + 基础设置页 → 可发布的 0.1.0

---