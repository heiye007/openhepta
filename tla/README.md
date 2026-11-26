# OpenHepta TLA+ 形式化验证 (`tla/`)

本目录使用 **TLA+ / TLC 模型检查器** 对 OpenHepta 的核心并发调度、DAG 层级拓扑与树形原子操作进行穷举状态空间验证。

---

## 一、已建模与验证的核心规范

| 规范文件 | 对应实现模块 | 验证的不变式与活性属性 |
| :--- | :--- | :--- |
| [DbMaster3R1W.tla](./DbMaster3R1W.tla) ([.cfg](./DbMaster3R1W.cfg)) | `electron-main/database/dbMaster.ts` | `SingleActiveWriter`（单写者互斥）、`DisjointWriteLifecycle`（FIFO 队列不重不漏）、`ReaderPoolBound`（最多 3 并发读者）、`VersionMatchesCompletedWrites`、`AllEnqueuedWritesComplete`（活性：所有入队写操作终将完成） |
| [WhiteboardHierarchy.tla](./WhiteboardHierarchy.tla) ([.cfg](./WhiteboardHierarchy.cfg)) | `electron-main/api/whiteboardsApi.ts` | `NoCycles`（DAG 严格无环）、`SingleChildOwnership`（每个子白板至多有一个 `isChild` 归属宿主，复制自动降级为 `shortcut`）、`PlacementMatchesParent`、`CardsAlwaysPreserved`（递归软删除白板绝不删除任何卡片） |
| [MindMapTree.tla](./MindMapTree.tla) ([.cfg](./MindMapTree.cfg)) | `electron-renderer/src/primitives/canvas-math/mindmapLayout.ts`、`electron-main/cli/mindmapCliHandler.ts` | `RootProtected`（禁止删改根节点）、`BidirectionalConsistency`（父子引用严格双向一致）、`ChildrenClosedUnderNodes`、`NoCycles`（移动节点环路拦截）、`EveryNonRootHasParent`、`SubtreeSideConsistency`（子树侧向严格一致） |
| [CrossWhiteboardMove.tla](./CrossWhiteboardMove.tla) ([.cfg](./CrossWhiteboardMove.cfg)) | `electron-main/api/whiteboardsApi.ts` (`moveObjectsAcross`) | `NoCrossWhiteboardConnections`（跨白板迁移后零悬空/跨板连线）、`NoSelfLoops`、`SectionCoLocation`（分区及其子对象始终同板共址） |
| [LocalFileStoreCAS.tla](./LocalFileStoreCAS.tla) ([.cfg](./LocalFileStoreCAS.cfg)) | `electron-main/local-file/LocalFileStore.ts` | `NoDanglingReferences`（所有活跃引用指向的 SHA-256 物理文件必存在）、`RefCountExact`（引用计数严格精确）、`NoOrphanBlobs`（零孤儿物理文件） |
| [CardTagHighlightLifecycle.tla](./CardTagHighlightLifecycle.tla) ([.cfg](./CardTagHighlightLifecycle.cfg)) | `electron-main/api/cardsApi.ts`、`tagsApi.ts`、`documentsApi.ts`、`highlightsApi.ts` | `NoGhostBacklinks`（无幽灵反链）、`NoOrphanCardTags`（无孤儿卡片标签绑定）、`HighlightsHaveAliveSource`（高亮源文献必存活）、`NoOrphanHighlightTags`（无孤儿高亮标签绑定） |
| [ReferencesDrawerStack.tla](./ReferencesDrawerStack.tla) ([.cfg](./ReferencesDrawerStack.cfg)) | `electron-renderer/src/features/card-drawer/CardDrawer.tsx`、`App.tsx` | `NoDuplicateCardsInStack`（多卡引用栈严格无重复 ID）、`StackBoundedByCards`（打开/移除/替换/拖拽重排原子一致） |

---

## 二、运行方式

需要本地安装 Java（推荐 JDK 21+ / 25）。运行以下命令会自动下载 `tla2tools.jar` 至 `tla/.tools/`（已加入 `.gitignore`）并依次执行 TLC 模型检查：

```bash
# 运行全部 TLA+ 规范验证
pnpm verify:tla

# 单独验证某一个规范
node tla/run-tlc.mjs DbMaster3R1W
node tla/run-tlc.mjs WhiteboardHierarchy
node tla/run-tlc.mjs MindMapTree
```
