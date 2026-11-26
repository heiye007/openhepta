import fs from "node:fs";
import path from "node:path";

export function checkWhiteboardSelectionInvariants(rootDir, violations) {
  const canvasRel = "electron-renderer/src/features/whiteboard/WhiteboardCanvas.tsx";
  const canvasPath = path.join(rootDir, canvasRel);
  if (!fs.existsSync(canvasPath)) return;

  const canvasText = fs.readFileSync(canvasPath, "utf8");

  if (!canvasText.includes("data-canvas-ui") || !canvasText.includes("[data-canvas-ui]")) {
    violations.push({
      file: canvasRel,
      line: 1,
      column: 1,
      rule: "whiteboard-floating-toolbar-stop-mousedown",
      message:
        "WhiteboardCanvas.tsx 的浮动工具栏必须标记 data-canvas-ui 且 handleMouseDown 必须跳过 [data-canvas-ui] / button / input / [role='dialog']，防止点击画布浮层按钮时误清空多选或误触发框选。",
    });
  }

  if (
    !canvasText.includes("handleWindowMarqueeMove") ||
    !canvasText.includes("handleWindowMarqueeUp")
  ) {
    violations.push({
      file: canvasRel,
      line: 1,
      column: 1,
      rule: "whiteboard-marquee-window-listeners",
      message:
        "WhiteboardCanvas.tsx 的框选（isMarqueeRef）必须绑定 window 级 mousemove / mouseup 监听（handleWindowMarqueeMove / handleWindowMarqueeUp），避免鼠标划过卡片或工具栏边缘时丢失框选与松手事件。",
    });
  }

  const keyGMatch = /case\s+'g'\s*:[\s\S]*?break;/.exec(canvasText);
  if (!keyGMatch || !keyGMatch[0].includes("handleCreateSectionForSelected")) {
    violations.push({
      file: canvasRel,
      line: 1,
      column: 1,
      rule: "whiteboard-shortcut-g-wraps-selection",
      message:
        "WhiteboardCanvas.tsx 的快捷键 'g' 在 selectedObjectIds.size > 0 时必须调用 handleCreateSectionForSelected() 打包选中元素，禁止无条件创建空白分区。",
    });
  }
}
