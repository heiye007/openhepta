# OpenHepta 项目架构规范 (`AGENTS.md`)

OpenHepta 是一个本地优先（Local-First）的桌面端可视化知识工作台（Electron + React + TypeScript + SQLite 3R1W + ProseMirror + PDF.js / EPUB.js）。

---

## 一、核心架构原则

1. **所有功能都是 API（All Features as API）**
   - 渲染层禁止直接编写 SQL 或直接调用 `window.heptaElectronApi`。
   - 所有业务能力（卡片、白板、文档、高亮、标签、本地文件、通知、更新、系统诊断）统一由 `electron-main/api/` 暴露为强类型 IPC 接口，经 `shared/api.ts` 契约定义，并由 `electron-renderer/src/client/` 封装为 `heptaClient` 供渲染层调用。
2. **前后端顶层绝对隔离（Strict Import Bans）**
   - `electron-renderer/` 与 `electron-main/` **严禁任何形式的相互导入**（包括 `import type`、`export ... from`、`require()`、动态 `import()`）。
   - 跨端共享的类型、IPC 通道常量、配色与纯数据辅助函数，必须统一经过顶层 `shared/` 共享。
3. **One Folder Per Feature（Feature 间水平隔离）**
   - `electron-renderer/src/features/<featureA>/` 禁止直接导入 `electron-renderer/src/features/<featureB>/`。
   - 跨 Feature 复用的组件（编辑器、元数据栏、模态框、画布数学算法）下沉至 `electron-renderer/src/primitives/`，Feature 间的导航与弹窗协同由 `App.tsx` 编排。
4. **严格无注释（No Comments in Code）**
   - `electron-main/`、`electron-renderer/` 与 `shared/` 内禁止出现任何 `//` 或 `/* ... */` 注释（由 ESLint 与架构检查器强制拦截）。
5. **禁止原生弹窗**
   - 禁止使用浏览器原生 `alert` / `confirm` / `prompt`（含 `window.*`、`globalThis.*`、`self.*`），统一使用 `electron-renderer/src/primitives/AppModal.tsx` 提供的 `useAppModal()`。
6. **每一个新功能都必须配备独立 CLI（One CLI Handler Per Feature）**
   - **严禁上线没有 CLI 操控与验收入口的新功能**。每新增一个业务功能，必须在 `electron-main/cli/` 下按**一功能一文件**原则新建 `<feature>CliHandler.ts`，在 `electron-main/cli/featureCliRouter.ts` 注册路由，并在 `cli/openhepta-cli.mjs` 暴露对应领域子命令，同步更新 [cli/README.md](./cli/README.md) 与 [FEATURE_MAP.md](./FEATURE_MAP.md)。
   - 已有功能的 CLI 处理器须保持单一职责，禁止把多个不相关功能堆砌进同一个大文件。
7. **禁止泄露本机路径（Repo-Relative Paths Only）**
   - 仓库内所有代码与 Markdown 文档严禁写入本机绝对路径（如 `file:///...`、盘符路径或用户目录路径），统一使用仓库相对路径（`./...` / `../...`）。

---

## 二、顶层目录结构

```text
openhepta/
├── shared/                              # 唯一跨端共享契约层（零外部运行时依赖）
│   ├── types.ts                         # 领域实体、状态与请求参数类型
│   ├── api.ts                           # IPC_CHANNELS 常量与 HeptaElectronApi 强类型契约
│   └── palette.ts                       # 卡片/分区/7色标注配色常量与纯解析函数
│
├── electron-main/                       # Electron 主进程（禁止导入 electron-renderer/）
│   ├── main.ts                          # 主进程入口
│   ├── preload.ts                       # contextBridge 桥接暴露 domain API
│   ├── startup/                         # 启动与宿主基础设施
│   │   ├── appLifecycle.ts              # 应用生命周期与单实例
│   │   ├── windowManager.ts             # 多窗口管理、图标与 nativeTheme 联动
│   │   ├── menu.ts                      # 应用菜单与 Windows Jump List
│   │   ├── protocols.ts                 # hepta-file:// 与 hepta-preview:// (支持 Range 206)
│   │   └── storage.ts                   # SQLite 与 LocalFileStore 初始化/清理
│   ├── api/                             # 领域 IPC API 处理器
│   │   ├── index.ts
│   │   ├── cardsApi.ts                  # 卡片 CRUD、FTS5、Inbox、Journal、反链
│   │   ├── whiteboardsApi.ts            # 白板 CRUD、克隆、对象、连线、缩略图统计
│   │   ├── documentsApi.ts              # PDF/EPUB 文档元数据与阅读进度
│   │   ├── highlightsApi.ts             # 7 色文本/区域高亮 CRUD 与查询
│   │   ├── tagsApi.ts                   # 标签 CRUD 与卡片关联
│   │   ├── localFileApi.ts              # 文件导入、Buffer 读取、截图落盘、外链打开
│   │   └── systemApi.ts                 # 主题、新建窗口、CLI/系统诊断、通知与更新路由
│   ├── notifications/
│   │   └── notificationService.ts       # 系统通知与最近通知记录
│   ├── update/
│   │   └── updateService.ts             # 版本与更新检查服务
│   ├── cli/                             # 实时应用控制 HTTP 桥（一功能一文件）
│   │   ├── cliServer.ts                 # 127.0.0.1:48921 入口与通用无障碍驱动
│   │   ├── cliHelpers.ts                # CLI 公共参数解析、事件派发与状态查询
│   │   ├── featureCliRouter.ts          # 领域 CLI 统一路由注册表
│   │   └── <feature>CliHandler.ts       # 按功能拆分的独立处理器（nav/whiteboard/mindmap/card/drawer/document/highlight/inbox/journal/tag/search/system/upload 等）
│   ├── database/                        # 3R1W (3 Readers + 1 Writer) WAL SQLite 引擎
│   │   ├── dbMaster.ts
│   │   ├── dbWorker.ts
│   │   ├── migrations.ts                # v1 核心表、v2 FTS5、v3 documents & highlight_elements
│   │   └── __tests__/testDb.ts
│   ├── local-file/
│   │   └── LocalFileStore.ts            # SHA-256 内容寻址去重与影子资产库
│   └── types/
│       └── sqlite.d.ts
│
├── electron-renderer/                   # Electron 渲染进程（禁止导入 electron-main/）
│   ├── index.html
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   ├── public/fonts/                    # 离线 Inter 字体族
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                      # App Framework（顶层导航、视图切换与全局状态编排）
│       ├── index.css                    # Heptabase 明暗双主题 CSS 变量（157 亮 / 120 暗）
│       ├── env.d.ts
│       ├── client/                      # 唯一允许访问 window.heptaElectronApi 的层
│       │   ├── index.ts                 # 导出统一 heptaClient
│       │   └── ipcBridge.ts
│       ├── primitives/                  # 跨 Feature 复用的底层 UI 原语（禁止依赖 features/ 或 client/）
│       │   ├── AppModal.tsx             # 多模态对话框（Alert / Confirm / Prompt）
│       │   ├── canvas-math/             # 坐标系与自动排版算法
│       │   ├── card-editor/             # ProseMirror 编辑器、heptabase-editor.css、表格/公式/媒体 NodeView
│       │   └── card-metadata/           # CardTagsPropertiesBar、CardBacklinksSection
│       └── features/                    # One folder per feature（严禁跨 feature 互引）
│           ├── sidebar/                 # 左侧边栏与工作区/模式切换
│           ├── whiteboard/              # 无限白板、Card/Section/Mindmap/Document/Highlight 节点与连线
│           ├── whiteboards-library/     # 白板库汇总与实时 SVG 缩略图
│           ├── card-library/            # 卡片库（Grid/Table/List、批量操作）与 FullCardModal
│           ├── card-drawer/             # 右侧可停靠 References 卡片栈抽屉
│           ├── reader/                  # PDF (pdfjs-dist) + 原生 EPUB (epubjs) 阅读器与 7 色高亮
│           ├── highlights/              # 全局高亮汇总与原页码/CFI 精准跳回
│           ├── inbox/                   # 收集箱
│           ├── journal/                 # 每日日记
│           ├── tags/                    # 标签库
│           ├── search/                  # 全局快速检索 (Ctrl+K / Ctrl+O)
│           ├── chat/                    # 本地知识检索对话视图
│           └── system-status/           # 3R1W 存储拓扑、通知与更新状态视图
│
├── cli/                                 # 实时客户端控制 CLI（launch / aria-click / snapshot / screenshot）
│   ├── openhepta-cli.mjs
│   └── README.md
├── lint-rules/                          # 模块化 ESLint 与 AST 依赖图规则（001- ~ 011-）
│   ├── check-architecture.mjs           # TypeScript AST 依赖图分析器 + 零注释/禁裸SQL/禁裸IPC 校验
│   ├── index.mjs
│   └── docs.md
├── tla/                                 # TLA+ 形式化验证规范与 TLC 模型检查运行器（pnpm verify:tla，共 7 套）
│   ├── run-tlc.mjs
│   ├── DbMaster3R1W.tla                 # 3R1W 并发读写调度不变式与活性
│   ├── WhiteboardHierarchy.tla          # 子白板 DAG 无环、单子归属与删板保卡
│   ├── MindMapTree.tla                  # 思维导图树无环、根节点保护与双向一致性
│   ├── CrossWhiteboardMove.tla          # 跨白板对象迁移、分区展开与连线拓扑拆分
│   ├── LocalFileStoreCAS.tla            # SHA-256 去重资产库引用计数与零孤儿文件
│   ├── CardTagHighlightLifecycle.tla    # 卡片双链、标签与文献高亮生命周期一致性
│   └── ReferencesDrawerStack.tla        # 右侧 References 卡片栈去重与重排不变式
├── FEATURE_MAP.md                       # Feature Map（功能→入口→证据）与 Function Map（符号/API 映射）
└── assets/icon.png                      # 应用窗口与任务栏图标
```

---

## 三、依赖层级与静态分析规则

依赖方向必须严格单向流动：

```text
shared/  <───────────────────────  electron-main/
  ▲
  ├─────── electron-renderer/src/client/
  ├─────── electron-renderer/src/primitives/
  └─────── electron-renderer/src/features/<name>/  <──  electron-renderer/src/App.tsx
```

由 [lint-rules/check-architecture.mjs](./lint-rules/check-architecture.mjs) 与 [eslint.config.mjs](./eslint.config.mjs) 共同强制执行：

| 规则 | 约束内容 |
| :--- | :--- |
| `renderer-main-isolation` / `main-renderer-isolation` | 禁止 `electron-renderer/` 与 `electron-main/` 任何互引（含 `import type`） |
| `shared-isolation` | `shared/` 禁止导入 `electron-main/` 或 `electron-renderer/` |
| `cross-feature-import` | 禁止 `features/<A>/` 导入 `features/<B>/` |
| `primitives-layering` / `client-layering` | `primitives/` 禁止导入 `features/` 或 `client/`；`client/` 禁止导入 `features/` 或 `primitives/` |
| `no-direct-electron-api` | 仅 `electron-renderer/src/client/` 与 `env.d.ts` 允许访问 `heptaElectronApi` |
| `no-renderer-raw-sql` | 禁止在 `electron-renderer/` 中编写裸 SQL 语句 |
| `no-comments` | 禁止在 `electron-main/`、`electron-renderer/`、`shared/` 中存在任何注释 |
| `no-alert` / 原生弹窗拦截 | 禁止调用原生 `alert`、`confirm`、`prompt` |
| `no-legacy-src-import` | 禁止引用已废弃的 `src/` 路径 |

---

## 四、开发工作流：Feature & Function Map 与 Command-Line Tool

在日常开发与迭代中，**Feature & Function Map** 与 **Command-Line Tool** 分别承担「**设计定位**」与「**真机验收**」职责：

1. **开发前定边界（[FEATURE_MAP.md](./FEATURE_MAP.md)）**
   - 通过 **Function Map** 查明需求归属的 `features/<name>/`、`heptaClient.<domain>` 方法与 `electron-main/api/*` 处理器，严禁跨 Feature 互引或裸写 SQL。
   - 新增/重构功能后同步更新 [FEATURE_MAP.md](./FEATURE_MAP.md)（按 `What features exist → How users reach it → What proves it works` 记录入口与验证方式）。
2. **编写组件时保障可测性**
   - 为交互式图标按钮、输入框、Tab 等补充清晰的 `aria-label`（如 `aria-label="Settings"`），确保 CLI 可按无障碍名称稳定定位。
3. **同步交付功能专属 CLI（硬性要求）**
   - 每个新功能必须配套独立的 `electron-main/cli/<feature>CliHandler.ts`（覆盖该功能的核心查询与增删改操控，并在写库后触发渲染层热刷新）、注册至 `featureCliRouter.ts` 与 `cli/openhepta-cli.mjs`，并更新 [cli/README.md](./cli/README.md)。
4. **改动后真机自动验收（[cli/README.md](./cli/README.md)）**
   - 每次完成功能、UI 或交互改动后，除静态编译外，必须通过对应领域 CLI 与通用 CLI 驱动真实 Electron 窗口完成端到端闭环验证：

```bash
pnpm lint && pnpm build
node cli/openhepta-cli.mjs launch
node cli/openhepta-cli.mjs <feature> <action> [options]
node cli/openhepta-cli.mjs aria-click --accessible-name "Settings"
node cli/openhepta-cli.mjs snapshot
node cli/openhepta-cli.mjs screenshot proof.png
```

---

## 五、常用命令

```bash
# 1. 全量规范与架构依赖图校验（ESLint + check-architecture.mjs）
pnpm lint

# 2. 单独运行依赖图与零注释分析器
pnpm check:arch

# 3. 类型检查
npx tsc --noEmit
npx tsc -p tsconfig.electron.json --noEmit

# 4. 生产构建（输出至 dist-renderer/ 与 dist-electron/）
pnpm build

# 5. 数据库 3R1W 与 LocalFileStore 集成测试
pnpm test:db

# 6. TLA+ 形式化模型检查（3R1W / 子白板层级 / 思维导图树）
pnpm verify:tla
```

> **Windows 启动提示**：若在 IDE 集成终端中运行 Electron，可能因继承 `ELECTRON_RUN_AS_NODE=1` 导致启动异常。可直接双击根目录 [start-app.bat](./start-app.bat)（已内置清除该环境变量）。
