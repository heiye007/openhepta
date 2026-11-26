# OpenHepta Lint 与架构依赖规则文档

本目录采用**按规则类型分文件夹、按 `001-` 序号命名**的模块化组织方式，同时驱动 **ESLint 静态检查**（[eslint.config.mjs](../eslint.config.mjs)）与 **TypeScript AST 依赖图/源码扫描器**（[lint-rules/check-architecture.mjs](./check-architecture.mjs)）。

---

## 一、目录结构

```text
lint-rules/
├── docs.md                               # 本规则说明文档
├── check-architecture.mjs                # TypeScript AST 依赖图/源码扫描器入口
├── index.mjs                             # 统一聚合入口：导出 buildEslintConfig() 与 AST 检查器注册表
├── shared/
│   └── pathUtils.mjs                     # 路径归一化、别名解析（@shared/@/@renderer/@main）与共用正则常量
├── 001-cross-boundary-isolation/         # 001: 跨端与共享层边界隔离
│   ├── eslint.mjs
│   └── ast.mjs
├── 002-feature-and-layering/             # 002: Feature 水平隔离与渲染层分层
│   ├── eslint.mjs
│   └── ast.mjs
├── 003-api-and-sql-boundaries/           # 003: 全功能 API 化与禁裸 SQL/裸 IPC
│   ├── eslint.mjs
│   └── ast.mjs
├── 004-no-comments/                      # 004: 全量代码零注释
│   ├── eslint.mjs
│   └── ast.mjs
└── 005-no-native-dialogs/                # 005: 禁止原生浏览器弹窗
    └── eslint.mjs
└── 006-dev-server-and-electron-startup/  # 006: Dev Server 启动性能与 Electron 防卡顿守卫
    ├── eslint.mjs
    └── ast.mjs
```

---

## 二、规则分类明细

### `001-cross-boundary-isolation` — 跨端与共享层隔离

- **实现文件**：[eslint.mjs](./001-cross-boundary-isolation/eslint.mjs)、[ast.mjs](./001-cross-boundary-isolation/ast.mjs)
- **约束范围**：`electron-renderer/`、`electron-main/`、`shared/`
- **规则说明**：
  - `renderer-main-isolation`：`electron-renderer/` 严禁导入 `electron-main/` 中的任何代码或类型（覆盖 `import`、`import type`、`export ... from`、`require()`、动态 `import()` 与 `import('...').Type`）。
  - `main-renderer-isolation`：`electron-main/` 严禁导入 `electron-renderer/` 中的任何代码或类型。
  - `shared-isolation`：`shared/` 严禁导入 `electron-main/` 或 `electron-renderer/`。
  - `no-legacy-src-import`：禁止导入已废弃的旧 `src/` 目录。

---

### `002-feature-and-layering` — Feature 水平隔离与分层

- **实现文件**：[eslint.mjs](./002-feature-and-layering/eslint.mjs)、[ast.mjs](./002-feature-and-layering/ast.mjs)
- **约束范围**：`electron-renderer/src/`
- **规则说明**：
  - `cross-feature-import`（One Folder Per Feature）：`electron-renderer/src/features/<featA>/` 禁止直接导入另一个 `features/<featB>/`，也禁止从 `features` 根聚合出口导入；Feature 间通信与编排统一上收至 `App.tsx`，公共 UI 下沉至 `primitives/` 或 `shared/`。
  - `primitives-layering`：`electron-renderer/src/primitives/` 禁止导入 `features/` 或 `client/`。
  - `client-layering`：`electron-renderer/src/client/` 禁止导入 `features/` 或 `primitives/`。

---

### `003-api-and-sql-boundaries` — 全功能 API 化边界

- **实现文件**：[eslint.mjs](./003-api-and-sql-boundaries/eslint.mjs)、[ast.mjs](./003-api-and-sql-boundaries/ast.mjs)
- **约束范围**：`electron-renderer/`
- **规则说明**：
  - `no-direct-electron-api`：除 `electron-renderer/src/client/` 与 `electron-renderer/src/env.d.ts` 外，渲染层禁止直接访问 `heptaElectronApi`（含 `window.heptaElectronApi`、`globalThis.heptaElectronApi` 及标识符引用），业务调用统一经过 `client/` 导出的 `heptaClient`。
  - `no-renderer-raw-sql`：禁止在 `electron-renderer/` 的字符串字面量或模板字符串中编写裸 SQL 语句（`SELECT ... FROM`、`INSERT INTO`、`UPDATE ... SET`、`DELETE FROM`）。

---

### `004-no-comments` — 严格无注释

- **实现文件**：[eslint.mjs](./004-no-comments/eslint.mjs)、[ast.mjs](./004-no-comments/ast.mjs)
- **约束范围**：`electron-main/`、`electron-renderer/`、`shared/`
- **规则说明**：
  - `no-comments`：
    - ESLint 通过 `local/no-comments`（`sourceCode.getAllComments()`）拦截 TS/TSX 中的所有单行与块级注释。
    - AST 扫描器通过 `checkCodeComments`（先屏蔽字符串、模板字符串、正则与 JSX 文本，避免误伤 `http://` 等 URL）与 `checkCssComments` 检查所有 `.ts`/`.tsx`/`.js`/`.mjs`/`.cjs` 与 `.css` 文件，发现任何 `//` 或 `/* ... */` 即报错退出。

---

### `005-no-native-dialogs` — 禁止原生弹窗

- **实现文件**：[eslint.mjs](./005-no-native-dialogs/eslint.mjs)
- **约束范围**：全部 `**/*.{ts,tsx}`
- **规则说明**：
  - 启用 `no-alert`、`no-restricted-globals` 与 `no-restricted-properties`，全面禁止 `alert`、`confirm`、`prompt` 以及 `window.*` / `globalThis.*` / `self.*` 形式调用。
  - 所有提示、确认、输入弹窗统一使用 `electron-renderer/src/primitives/AppModal.tsx` 提供的 `useAppModal()`。

> **注意事项**：在 `003-api-and-sql-boundaries/eslint.mjs` 中配置 `no-restricted-properties` 时，显式展开复用了 `005-no-native-dialogs/eslint.mjs` 导出的 `nativeDialogRestrictedProperties`，防止 ESLint Flat Config 同名规则数组被后者覆盖。

---

### `006-dev-server-and-electron-startup` — Dev Server 启动性能与 Electron 防卡顿守卫

- **实现文件**：[eslint.mjs](./006-dev-server-and-electron-startup/eslint.mjs)、[ast.mjs](./006-dev-server-and-electron-startup/ast.mjs)
- **约束范围**：`electron-main/`、`package.json`、`vite.config.ts`
- **规则说明**：
  - `no-blind-loadurl-retry`：禁止在 `setTimeout` / `setInterval` 中盲目重试调用 `loadURL(...)`（避免在 Vite 就绪前反复触发 `did-fail-load`、白屏与页面闪烁卡顿），要求先在主进程通过 HTTP 探测 Dev Server 就绪后再加载。
  - `dev-electron-env-guard` & `dev-electron-build-guard`：`package.json` 的 `scripts.dev` 必须先编译主进程（`tsconfig.electron.json` / `build:electron`）并在子进程环境中彻底 `delete ELECTRON_RUN_AS_NODE` 后再拉起 Electron。
  - `vite-optimize-deps-guard` & `vite-watch-ignore-guard`：`vite.config.ts` 必须配置 `optimizeDeps`（预打包核心依赖并排除 `pdfjs-dist`）以及 `server.watch.ignored`（忽略 `dist-electron/`、`dist-renderer/` 等构建与工具目录），防止 Vite Dev 模式下反复触发依赖重优化整页重载与卡顿。

---

### `007-pdf-overlay-layering` — PDF 高亮/框选叠加层与拖拽事件守卫

- **实现文件**：[eslint.mjs](./007-pdf-overlay-layering/eslint.mjs)、[ast.mjs](./007-pdf-overlay-layering/ast.mjs)
- **约束范围**：`electron-renderer/src/features/reader/PdfReader.tsx`、`electron-renderer/src/features/reader/reader.css`
- **规则说明**：
  - `pdf-overlay-above-textlayer`：PDF 页面的高亮与框选区叠加容器（`inset-0 pointer-events-none`）的 `z-index` 必须严格大于 `reader.css` 中 `.hepta-pdf-page .textLayer` 的 `z-index`（`2`），即必须使用 `z-[3]` 及以上，防止 `.textLayer` 遮挡框选框体和 8 向缩放手柄导致无法拖拽。
  - `pdf-area-drag-window-listeners`：`PdfReader.tsx` 中的框选区移动/缩放调整必须通过 `window.addEventListener('mousemove' / 'mouseup', ...)` 绑定全局监听，避免鼠标拖出单页容器边界时丢失松手事件。
  - `pdf-area-pending-override-guard` & `pdf-area-no-drag-opacity-transition`：调整结束时必须通过 `pendingRectOverrides` 保持最新矩形直到 `onUpdateHighlight` 落盘完成，并在调整期间禁用 `transition-opacity`，防止松手回弹与边框闪动。

---

### `008-ipc-bridge-and-inline-form-guards` — IPC 桥接完整性与行内标签输入守卫

- **实现文件**：[eslint.mjs](./008-ipc-bridge-and-inline-form-guards/eslint.mjs)、[ast.mjs](./008-ipc-bridge-and-inline-form-guards/ast.mjs)
- **约束范围**：`shared/api.ts`、`electron-main/preload.ts`、`electron-renderer/src/client/ipcBridge.ts`、`electron-renderer/src/primitives/card-metadata/HighlightTagChips.tsx`
- **规则说明**：
  - `ipc-bridge-completeness`：通过 TypeScript AST 同时比对 `shared/api.ts` 中 `HeptaElectronApi` 的每个领域接口方法与 `electron-renderer/src/client/ipcBridge.ts`（`heptaClient`）及 `electron-main/preload.ts`（`api`），防止新增 IPC 方法漏接转发导致运行时 `is not a function`。
  - `ipc-bridge-optional-chaining-guard`：强制 `electron-renderer/src/client/ipcBridge.ts` 中所有通过 `getRawApi()` 调用主进程接口的语句必须使用全链路可选链（如 `getRawApi()?.domain?.method?.(...)`），防止 Vite 热更新期间旧版 `preload.js` 未暴露新方法时抛出 `is not a function`。
  - `inline-tag-input-submit-guard`：要求行内标签输入框同时绑定 `onKeyDown`（处理 `Enter`/`Escape`）与 `onBlur`，避免在嵌套弹窗或失焦时无法提交标签。

---

### `009-whiteboard-connection-and-drag-stability` — 白板连线与拖拽稳定性守卫

- **实现文件**：[eslint.mjs](./009-whiteboard-connection-and-drag-stability/eslint.mjs)、[ast.mjs](./009-whiteboard-connection-and-drag-stability/ast.mjs)
- **约束范围**：`electron-renderer/src/features/whiteboard/ConnectionLayer.tsx`、`electron-renderer/src/features/whiteboard/WhiteboardCanvas.tsx`
- **规则说明**：
  - `whiteboard-connection-no-transition-all`：禁止在 `ConnectionLayer.tsx` 的 SVG `<path>` 上使用 `transition-all` 或 `animate-pulse`，避免拖动卡片时连线产生 150ms 滞后拖影或拖拽预览线闪烁。
  - `whiteboard-connection-no-hardcoded-active-end-dir`：禁止渲染 `activeConnectLine` 预览线时将 `getConnectionPath` 第 5 个参数（终点切线方向）硬编码为字面量（如 `'left'`），要求根据起终点相对方向动态计算并在悬停目标时磁吸对齐。
  - `whiteboard-connection-edge-gap-auto-anchor`：要求 `'auto'` 锚点计算基于边缘净间距（`gapX` / `gapY`），禁止仅按中心点 `|dx| > |dy|` 判断导致高卡片移动时连线意外翻转。
  - `whiteboard-connection-lock-auto-anchor`：ESLint 与 AST 双重守卫，强制 `resolvedAutoAxisRef.current.set(...)` 按 `conn.id` 锁定具体起止方向 `{ beginDir, endDir }` 并通过 `cached.beginDir` / `cached.endDir` 复用（调用 `getObjectAnchor` 必须传入 `conn.id` 与 `isSource`），禁止仅缓存轴向并在拖动卡片时动态重算翻转旧版 `'auto'` 连线的锚点。
  - `whiteboard-card-aria-label-for-cli-drag`：要求 `WhiteboardCardNode.tsx` 卡片根节点保留 `aria-label={`Card: ...`}`，确保 CLI `aria-drag` 可稳定执行真机拖动回归验证。
  - `whiteboard-viewport-hydrate-once-per-wb`：要求 `loadWhiteboardData` 通过 `hydratedViewportWbIdRef` 仅在切换白板首次加载时调用 `setViewport`，且禁止 `handleCreateConnection` 调用 `loadWhiteboardData()` 触发全量重载覆盖 500ms 防抖前的旧视口。
  - `whiteboard-drag-end-live-objects-ref`：要求 `handleCardDragEnd` 通过 `objectsRef.current` 读取最新实时对象坐标，禁止读取旧闭包 `objectsMap` 导致拖动松手时保存旧坐标回弹。
  - `whiteboard-pan-right-and-middle-drag-guard`：强制 `WhiteboardCanvas.tsx` 对齐 Heptabase 画布平移机制，在捕获阶段（`onMouseDownCapture` / `onContextMenuCapture`）及 `if (clickedObject) return` 之前处理鼠标右键拖拽（`e.button === 2` + `rightDragMovedRef` 抑制菜单）、中键拖拽（`e.button === 1` + `preventDefault`）和抓手/空格平移，确保任意位置都能顺畅移动画布。

---

### `010-whiteboard-selection-and-toolbar-guards` — 白板多选浮动工具栏与全局框选守卫

- **实现文件**：[eslint.mjs](./010-whiteboard-selection-and-toolbar-guards/eslint.mjs)、[ast.mjs](./010-whiteboard-selection-and-toolbar-guards/ast.mjs)
- **约束范围**：`electron-renderer/src/features/whiteboard/WhiteboardCanvas.tsx`
- **规则说明**：
  - `whiteboard-floating-toolbar-stop-mousedown`：多选浮动工具栏必须绑定 `onMouseDown={(e) => e.stopPropagation()}` 并标记 `data-canvas-ui="true"`，且 `handleMouseDown` 必须跳过 `[data-canvas-ui]` / `button` / `input` / `[role="dialog"]`，防止点击「打包框入新分区」「打包子白板」「对齐」等按钮时 `mousedown` 冒泡到画布提前清空 `selectedObjectIds` 导致点击静默失败。
  - `whiteboard-marquee-window-listeners`：框选区域必须使用 `window` 级 `mousemove` / `mouseup` 监听（`handleWindowMarqueeMove` / `handleWindowMarqueeUp`），避免拖出画布或经过浮层时丢失框选与松手事件。
  - `whiteboard-shortcut-g-wraps-selection`：快捷键 `G` 在已选中多个元素时必须调用 `handleCreateSectionForSelected()` 打包框入新分区，而非创建无关的空白分区。

---

### `011-dropdown-overflow-clip-guard` — 下拉菜单防父级 `overflow-hidden` 裁切守卫

- **实现文件**：[eslint.mjs](./011-dropdown-overflow-clip-guard/eslint.mjs)
- **约束范围**：`electron-renderer/src/**/*.{ts,tsx}`
- **规则说明**：
  - `no-dropdown-inside-overflow-hidden`：检测所有 `absolute` 浮层下拉菜单（`role="menu"` 或 `bg-menu-bg` + 浮层层级/阴影），禁止其 8 层以内的非整页布局祖先容器带有 `overflow-hidden`，避免卡片或缩略图容器裁切遮挡菜单项（如白板库卡片的 `More actions` 菜单）。要求将 `overflow-hidden` 仅下沉至内容/缩略图内层，并在菜单展开时提升卡片 `z-index`。
  - `no-bottom-toolbar-menu-downward-clip`：禁止位于视口底部停靠栏（`absolute/fixed` + `bottom-*`）或纵向浮动工具栏（`absolute/fixed` + `flex-col` + `left-*/right-*`）最末端的 `absolute` 浮层菜单使用 `top-0` / `top-full` 向下展开，防止底部菜单项超出窗口被截断（如左侧白板工具栏底部的 `...` 更多工具菜单）。要求改为 `bottom-0` / `bottom-11` 向上展开，并按需补充 `max-h-[calc(100vh-80px)] overflow-y-auto`。
  - `editor-overlay-menu-use-portal`：强制 `FloatingOverlays.tsx` 中的 `SlashMenu`、`MentionMenu`、`WhiteboardPickerMenu` 必须通过 `createPortal(..., document.body)` 配合 `position: 'fixed'` 与 `onWheel={(e) => e.stopPropagation()}` 渲染，防止在 Journal、白板卡片或抽屉等局部容器中以 `position: 'absolute'` 渲染时被边界裁切或滚轮冒泡。
  - `whiteboard-wheel-yields-to-editor-menus`：强制 `WhiteboardCanvas.tsx` 的 `handleWheel` 检测当前是否存在打开的 `.hepta-slash-menu` / `.hepta-mention-menu` / `.hepta-whiteboard-picker` 并拦截转发滚轮，防止鼠标停留在卡片上方滚动时把画布滚走导致固定定位菜单与输入光标脱节。

---

## 三、运行与测试命令

```bash
# 运行全量检查（ESLint + AST 依赖图与零注释扫描）
pnpm lint

# 仅运行 AST 依赖图与零注释扫描器
pnpm check:arch

# 单文件 / 标准输入验证（不修改磁盘文件）
node lint-rules/check-architecture.mjs --stdin --filename electron-renderer/src/App.tsx
npx eslint --stdin --stdin-filename electron-renderer/src/features/inbox/InboxView.tsx
```

---

## 四、扩展新规则约定

1. 在 `lint-rules/` 下新建按三位序号递增的目录，例如 `006-<rule-category>/`。
2. 按需在目录内提供 `eslint.mjs`（ESLint 插件规则与配置片段）和/或 `ast.mjs`（AST 检查函数），共享路径工具从 `../shared/pathUtils.mjs` 引入。
3. 在 [lint-rules/index.mjs](./index.mjs) 中注册并导出新规则，并同步运行 `pnpm lint` 验证通过。
