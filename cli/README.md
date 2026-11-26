# OpenHepta Command-Line Tool (`app` / `openhepta`)

OpenHepta 内置一套面向真实桌面客户端的自动化 CLI 工具，通过主进程本地控制服务（`127.0.0.1:48921`）直接驱动运行中的 Electron 窗口，支持按无障碍名称点击控件、输入文本、采集 DOM/无障碍快照并保存真机截图作为验证证据。

---

## 一、架构组成

```text
cli/openhepta-cli.mjs  ──(HTTP 127.0.0.1:48921)──▶  electron-main/cli/cliServer.ts
                                                        │
                                                        ├─▶ webContents.executeJavaScript (无障碍元素查找 / 快照)
                                                        ├─▶ webContents.sendInputEvent (真实鼠标点击)
                                                        ├─▶ webContents.insertText (文本输入)
                                                        └─▶ webContents.capturePage (PNG 窗口截图)
```

- **CLI 入口**：[cli/openhepta-cli.mjs](./openhepta-cli.mjs)（在 [package.json](../package.json) 中注册为 `bin.app`、`bin.openhepta` 与 `scripts.cli`）
- **主进程服务端**：[electron-main/cli/cliServer.ts](../electron-main/cli/cliServer.ts)（由 [appLifecycle.ts](../electron-main/startup/appLifecycle.ts) 随应用生命周期自动启停）

---

## 二、安装与调用方式

- **仓库内直接调用**：
  ```bash
  node cli/openhepta-cli.mjs <command> [options]
  # 或
  pnpm cli -- <command> [options]
  ```
- **全局注册为 `app` / `openhepta` 命令**（可选）：
  ```bash
  pnpm link --global
  app aria-click --accessible-name "Settings"
  app snapshot
  app screenshot proof.png
  ```
- **自定义端口**：默认监听 `127.0.0.1:48921`，可通过环境变量 `OPENHEPTA_CLI_PORT` 覆盖（主进程与 CLI 同时生效）。

---

## 三、命令说明

### 1. `launch` — 启动客户端并等待就绪
自动清除 `ELECTRON_RUN_AS_NODE`，以独立后台进程拉起 Electron 并轮询 `/health`（最长 15 秒）直到窗口就绪。
```bash
node cli/openhepta-cli.mjs launch
```

### 2. `status` — 检查运行状态
查询实时服务健康状态、主进程 PID、端口、窗口数量与窗口标题。
```bash
node cli/openhepta-cli.mjs status
```

### 3. `aria-click` — 按无障碍名称点击控件
按元素的 `aria-label`、`title`、可见文本、`placeholder` 或 `alt` 匹配控件，自动滚动到视口中央并发送真实 Electron 鼠标事件（`mouseMove` → `mouseDown` → `mouseUp`）。
```bash
node cli/openhepta-cli.mjs aria-click --accessible-name "Settings"
node cli/openhepta-cli.mjs aria-click --accessible-name "Whiteboards" --role button
node cli/openhepta-cli.mjs aria-click --accessible-name "Inbox" --exact --index 0
```
- `--accessible-name`（或 `--name`）：目标控件名称（必填）
- `--role`：按角色过滤（如 `button`、`link`、`textbox`、`tab`）
- `--exact`：精确匹配（默认支持忽略大小写的包含匹配）
- `--index`：存在多个匹配时指定索引（默认 `0`）

### 4. `aria-type` — 聚焦控件并输入文本
```bash
node cli/openhepta-cli.mjs aria-type --accessible-name "Find a card..." --text "Heptabase"
```

### 5. `aria-set-value` — 设置滑块 / 输入框 / 下拉框的值
按无障碍名称定位 `<input type="range">`（`slider`）、`input`、`textarea` 或 `select`，通过原生 setter 赋值并派发 `input` / `change` 事件。
```bash
node cli/openhepta-cli.mjs aria-set-value --accessible-name "Connection depth" --value 3
node cli/openhepta-cli.mjs aria-set-value --accessible-name "Fade other objects" --value 40
```

### 6. `snapshot` — 采集当前界面无障碍快照
返回当前窗口标题、视口尺寸及所有可见可交互控件的 `role`、`name`、状态（`checked`、`value`）与坐标矩形（含 `switch`、`slider`、`checkbox` 等）。
```bash
node cli/openhepta-cli.mjs snapshot
node cli/openhepta-cli.mjs snapshot --role button --filter "Whiteboard"
node cli/openhepta-cli.mjs snapshot --role switch
node cli/openhepta-cli.mjs snapshot --json
```

### 7. `screenshot` — 截取当前窗口并保存为 PNG 证据
调用 Electron `webContents.capturePage()` 截取当前真实渲染画面并写入磁盘。
```bash
node cli/openhepta-cli.mjs screenshot proof.png
node cli/openhepta-cli.mjs screenshot ./artifacts/settings-proof.png
```

### 8. `mindmap` — 实时操控白板思维导图
对当前活跃白板上的思维导图进行实时查询与操作，写库后自动触发渲染进程热刷新（`--mindmap-id` 可省略，默认指向当前白板最新导图）：
```bash
node cli/openhepta-cli.mjs mindmap list
node cli/openhepta-cli.mjs mindmap create --title "知识地图" --layout horizontal
node cli/openhepta-cli.mjs mindmap add-node --parent-id mm-root --text "分支 A" --side right --color orange
node cli/openhepta-cli.mjs mindmap edit-node --node-id mm-branch-1 --text "核心分支"
node cli/openhepta-cli.mjs mindmap move-node --node-id mm-branch-1-1 --parent-id mm-branch-2
node cli/openhepta-cli.mjs mindmap set-color --node-id mm-branch-1 --color purple
node cli/openhepta-cli.mjs mindmap collapse --node-id mm-branch-1
node cli/openhepta-cli.mjs mindmap expand --node-id mm-branch-1
node cli/openhepta-cli.mjs mindmap set-layout --layout vertical
node cli/openhepta-cli.mjs mindmap select-node --node-id mm-root
node cli/openhepta-cli.mjs mindmap delete-node --node-id mm-branch-2
node cli/openhepta-cli.mjs mindmap delete --mindmap-id wbo-mm-xxx
```

### 9. 全功能领域命令（覆盖 `FEATURE_MAP.md` 全部 12 项功能）

| 命令域 | 对应功能 | 支持子命令 |
| :--- | :--- | :--- |
| `nav` | 侧边栏与视图导航 | `go <whiteboard\|map\|cards\|inbox\|journal\|tags\|highlights\|chat\|status>`、`toggle-sidebar`、`open-whiteboard <id>`、`state` |
| `whiteboard` | 白板库与无限白板 | `list`、`create`、`rename`、`delete`、`open`、`objects`、`add-card`、`add-section`、`add-subwhiteboard`、`connect`、`delete-object`、`options` |
| `mindmap` | 思维导图 | `list`、`create`、`add-node`、`edit-node`、`move-node`、`delete-node`、`collapse`、`expand`、`set-color`、`set-layout`、`select-node`、`delete` |
| `card` | 卡片库与编辑器 | `list`、`create`、`update`、`delete`、`open`、`backlinks` |
| `drawer` | 右侧 References 抽屉 | `status`、`toggle`、`open-card <cardId>` |
| `document` | PDF / EPUB 阅读器 | `list`、`open <docId> [--highlight-id <hlId>]`、`delete <docId>` |
| `highlight` | 全局 7 色高亮汇总 | `list`、`create`、`update`、`delete`、`add-to-whiteboard` |
| `inbox` | 收集箱 | `list`、`capture --title <t> [--content <text>]` |
| `journal` | 每日日记 | `list`、`today [--content <text>] [--date YYYY-MM-DD]`、`open` |
| `tag` | 标签数据库 | `list`、`create`、`delete`、`attach`、`detach`、`cards` |
| `search` | 全局搜索 | `query <text>`、`open`、`close` |
| `system` | 主题与系统诊断 | `status`、`theme <light\|dark>`、`notify --title <t> --body <b>` |
| `upload` | 白板文件资产上传 | `file --path <filePath> [--x <n>] [--y <n>]`、`list` |

---

## 四、主进程 HTTP 控制接口（`127.0.0.1:48921`）

| 方法与路径 | 请求体 | 返回内容 |
| :--- | :--- | :--- |
| `GET /health` | — | `{ ok, pid, port, windowCount, hasWindow, title }` |
| `GET /snapshot` | — | `{ ok, title, url, viewport, activeTextPreview, elements }` |
| `POST /aria-click` | `{ accessibleName, role?, exact?, index? }` | `{ ok, clicked: { name, role, tag, cx, cy, matchCount } }` |
| `POST /aria-type` | `{ accessibleName?, text }` | `{ ok, typedLength }` |
| `POST /aria-set-value` | `{ accessibleName, value, role?, exact?, index? }` | `{ ok, updated: { name, role, value } }` |
| `POST /screenshot` | `{ outPath? }` | `{ ok, path, bytes, width, height }`（未传 `outPath` 时返回 `base64`） |
| `GET /mindmap/list` | — | `{ ok, whiteboardId, count, mindmaps }` |
| `POST /mindmap/action` | `{ action, mindmapId?, parentId?, nodeId?, ... }` | `{ ok, action, objectId, ... }` |
| `POST /feature/:domain` | `{ action, params }` | 全功能领域统一路由（`nav`/`whiteboard`/`card`/`drawer`/`document`/`highlight`/`inbox`/`journal`/`tag`/`search`/`system`） |

---

## 五、端到端验证示例

```bash
node cli/openhepta-cli.mjs launch
node cli/openhepta-cli.mjs aria-click --accessible-name "Settings"
node cli/openhepta-cli.mjs snapshot
node cli/openhepta-cli.mjs screenshot proof.png
```

文档阅读器（PDF / EPUB 一致翻页与状态验证）：
```bash
node cli/openhepta-cli.mjs aria-click --accessible-name "Open document: "
node cli/openhepta-cli.mjs snapshot --filter "Page"
node cli/openhepta-cli.mjs aria-click --accessible-name "Next Page" --exact
node cli/openhepta-cli.mjs screenshot reader-proof.png
```

