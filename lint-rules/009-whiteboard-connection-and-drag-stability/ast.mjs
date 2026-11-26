import fs from "node:fs";
import path from "node:path";

export function checkWhiteboardStabilityInvariants(rootDir, violations) {
  const connRel = "electron-renderer/src/features/whiteboard/ConnectionLayer.tsx";
  const canvasRel = "electron-renderer/src/features/whiteboard/WhiteboardCanvas.tsx";
  const connPath = path.join(rootDir, connRel);
  const canvasPath = path.join(rootDir, canvasRel);

  if (fs.existsSync(connPath)) {
    const connText = fs.readFileSync(connPath, "utf8");

    if (!connText.includes("gapX") || !connText.includes("gapY") || !connText.includes("resolvedAutoAxisRef")) {
      violations.push({
        file: connRel,
        line: 1,
        column: 1,
        rule: "whiteboard-connection-edge-gap-auto-anchor",
        message:
          "ConnectionLayer.tsx 的 'auto' 锚点计算必须基于边缘净间距（gapX / gapY）并保留 resolvedAutoAxisRef 记忆，防止卡片移动时连线在左右与上下边之间频繁翻转跳动。",
      });
    }

    if (
      !connText.includes("cached.beginDir") ||
      !connText.includes("cached.endDir")
    ) {
      violations.push({
        file: connRel,
        line: 1,
        column: 1,
        rule: "whiteboard-connection-lock-auto-anchor",
        message:
          "ConnectionLayer.tsx 的 'auto' 锚点必须按 connKey 锁定首次解析出的 concrete 方向（cached.beginDir / cached.endDir），禁止仅缓存轴向并在拖动卡片时动态重算翻转锚点。",
      });
    }

    if (
      connText.includes("mainOutline pointer-events-none transition-all") ||
      connText.includes("animate-pulse")
    ) {
      violations.push({
        file: connRel,
        line: 1,
        column: 1,
        rule: "whiteboard-connection-no-transition-all",
        message:
          "ConnectionLayer.tsx 的连线 <path> 禁止使用 transition-all 或 animate-pulse，避免拖动卡片或连线时出现滞后拖影与闪烁跳动。",
      });
    }
  }

  if (fs.existsSync(canvasPath)) {
    const canvasText = fs.readFileSync(canvasPath, "utf8");

    if (!canvasText.includes("hydratedViewportWbIdRef")) {
      violations.push({
        file: canvasRel,
        line: 1,
        column: 1,
        rule: "whiteboard-viewport-hydrate-once-per-wb",
        message:
          "WhiteboardCanvas.tsx 的 loadWhiteboardData 必须通过 hydratedViewportWbIdRef 仅在切换白板首次加载时调用 setViewport，防止连线或数据刷新时回写 500ms 防抖前的旧视口坐标导致画布跳动。",
      });
    }

    const createConnMatch = /const handleCreateConnection\s*=\s*async[\s\S]*?\n  \};/.exec(
      canvasText
    );
    if (createConnMatch && createConnMatch[0].includes("loadWhiteboardData(")) {
      violations.push({
        file: canvasRel,
        line: 1,
        column: 1,
        rule: "whiteboard-viewport-hydrate-once-per-wb",
        message:
          "WhiteboardCanvas.tsx 的 handleCreateConnection 禁止调用 loadWhiteboardData() 触发全量重载（请乐观更新 connections 状态并持久化 beginPos/endPos），防止连线瞬间跳动。",
      });
    }

    const dragEndMatch = /const handleCardDragEnd\s*=\s*async[\s\S]*?\n  \};/.exec(
      canvasText
    );
    if (
      !canvasText.includes("objectsRef.current = objects") ||
      (dragEndMatch && !dragEndMatch[0].includes("objectsRef.current"))
    ) {
      violations.push({
        file: canvasRel,
        line: 1,
        column: 1,
        rule: "whiteboard-drag-end-live-objects-ref",
        message:
          "WhiteboardCanvas.tsx 的 handleCardDragEnd 必须通过 objectsRef.current 读取实时最新对象坐标，禁止读取旧闭包中的 objectsMap，防止拖动松手时保存旧坐标导致卡片与连线回弹跳动。",
      });
    }

    const hasCapturePan =
      canvasText.includes("onMouseDownCapture={handleMouseDownCapture}") &&
      canvasText.includes("onContextMenuCapture={handleCanvasContextMenuCapture}");
    const hasRightAndMiddlePan =
      canvasText.includes("e.button === 1") &&
      canvasText.includes("e.button === 2") &&
      canvasText.includes("rightDragMovedRef");
    const mouseDownMatch = /const handleMouseDown\s*=\s*\([\s\S]*?\n  \};/.exec(canvasText);
    const isGrabBeforeClickedObject =
      mouseDownMatch &&
      mouseDownMatch[0].includes("isGrab") &&
      mouseDownMatch[0].includes("clickedObject") &&
      mouseDownMatch[0].indexOf("isGrab") <
      mouseDownMatch[0].indexOf("clickedObject");

    if (!hasCapturePan || !hasRightAndMiddlePan || !isGrabBeforeClickedObject) {
      violations.push({
        file: canvasRel,
        line: 1,
        column: 1,
        rule: "whiteboard-pan-right-and-middle-drag-guard",
        message:
          "WhiteboardCanvas.tsx 必须对齐 Heptabase 画布平移机制：在捕获阶段（onMouseDownCapture / onContextMenuCapture）及 clickedObject 判定之前处理右键拖拽（e.button === 2 + rightDragMovedRef 抑制菜单）、中键拖拽（e.button === 1 + preventDefault）以及抓手/空格平移，防止指针落在卡片上方时无法移动画布。",
      });
    }
  }

  const cardNodeRel = "electron-renderer/src/features/whiteboard/WhiteboardCardNode.tsx";
  const cardNodePath = path.join(rootDir, cardNodeRel);
  if (fs.existsSync(cardNodePath)) {
    const cardNodeText = fs.readFileSync(cardNodePath, "utf8");
    if (!cardNodeText.includes("latestCallbacksRef")) {
      violations.push({
        file: cardNodeRel,
        line: 1,
        column: 1,
        rule: "whiteboard-card-drag-latest-callbacks-ref",
        message:
          "WhiteboardCardNode.tsx 的窗口级 mousemove / mouseup 拖拽监听必须通过 latestCallbacksRef 调用最新回调，避免关闭旧闭包导致拖动时读取过期的 objectsMap 与 selectedObjectIds。",
      });
    }
    if (!cardNodeText.includes("aria-label={`Card:")) {
      violations.push({
        file: cardNodeRel,
        line: 1,
        column: 1,
        rule: "whiteboard-card-aria-label-for-cli-drag",
        message:
          "WhiteboardCardNode.tsx 卡片根节点必须保留 aria-label={`Card: ...`}，以支持 CLI 工具通过 aria-drag 真机回归测试卡片拖动与连线稳定性。",
      });
    }
  }
}
