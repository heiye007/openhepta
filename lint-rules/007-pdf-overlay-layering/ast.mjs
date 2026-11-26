import fs from "node:fs";
import path from "node:path";

function extractTextLayerZIndex(cssText) {
  const blockMatch = /\.hepta-pdf-page\s+\.textLayer\s*\{([^}]*)\}/.exec(cssText);
  if (!blockMatch) return 2;
  const zMatch = /z-index\s*:\s*(\d+)/i.exec(blockMatch[1]);
  return zMatch ? Number(zMatch[1]) : 2;
}

export function checkPdfOverlayInvariants(rootDir, violations) {
  const cssRel = "electron-renderer/src/features/reader/reader.css";
  const pdfRel = "electron-renderer/src/features/reader/PdfReader.tsx";
  const cssPath = path.join(rootDir, cssRel);
  const pdfPath = path.join(rootDir, pdfRel);
  if (!fs.existsSync(cssPath) || !fs.existsSync(pdfPath)) return;

  const cssText = fs.readFileSync(cssPath, "utf8");
  const pdfText = fs.readFileSync(pdfPath, "utf8");
  const textLayerZ = extractTextLayerZIndex(cssText);

  const overlayMatch = /className="([^"]*inset-0[^"]*pointer-events-none[^"]*)"/.exec(
    pdfText
  );
  if (overlayMatch) {
    const zMatch = /\bz-\[(\d+)\]/.exec(overlayMatch[1]);
    const zVal = zMatch ? Number(zMatch[1]) : 0;
    if (zVal <= textLayerZ) {
      violations.push({
        file: pdfRel,
        line: 1,
        column: 1,
        rule: "pdf-overlay-above-textlayer",
        message: `PDF 高亮与框选交互层 z-[${zVal}] 必须大于 reader.css 中 .textLayer 的 z-index (${textLayerZ})，否则手柄与框体无法响应拖拽。`,
      });
    }
  }

  const hasWindowMove =
    pdfText.includes("window.addEventListener('mousemove'") ||
    pdfText.includes('window.addEventListener("mousemove"');
  const hasWindowUp =
    pdfText.includes("window.addEventListener('mouseup'") ||
    pdfText.includes('window.addEventListener("mouseup"');
  if (!hasWindowMove || !hasWindowUp) {
    violations.push({
      file: pdfRel,
      line: 1,
      column: 1,
      rule: "pdf-area-drag-window-listeners",
      message:
        "PDF 框选区拖拽与缩放必须绑定 window 级 mousemove / mouseup 监听，避免鼠标移出页面边界时丢失调整与松手事件。",
    });
  }

  if (
    !pdfText.includes("pendingRectOverrides") ||
    !pdfText.includes("setPendingRectOverrides")
  ) {
    violations.push({
      file: pdfRel,
      line: 1,
      column: 1,
      rule: "pdf-area-pending-override-guard",
      message:
        "PDF 框选区调整结束时必须通过 pendingRectOverrides 保持最新矩形直到 onUpdateHighlight 落盘完成，防止松手瞬间回弹闪动。",
    });
  }

  if (!pdfText.includes("isAdjustingThis ? '' : 'transition-opacity'")) {
    violations.push({
      file: pdfRel,
      line: 1,
      column: 1,
      rule: "pdf-area-no-drag-opacity-transition",
      message:
        "PDF 框选区在拖拽/缩放期间必须禁用 transition-opacity（使用 isAdjustingThis ? '' : 'transition-opacity'），避免边框调整时闪烁。",
    });
  }
}
