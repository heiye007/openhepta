export const whiteboardSelectionEslintRules = {
  "whiteboard-floating-toolbar-stop-mousedown": {
    meta: {
      type: "problem",
      docs: {
        description:
          "Ensure floating multi-selection toolbar in WhiteboardCanvas stops onMouseDown propagation so clicking toolbar buttons does not clear selectedObjectIds before onClick fires",
      },
      schema: [],
    },
    create(context) {
      return {
        JSXOpeningElement(node) {
          if (node.name?.type !== "JSXIdentifier" || node.name.name !== "div") {
            return;
          }
          const styleAttr = node.attributes.find(
            (attr) => attr.type === "JSXAttribute" && attr.name?.name === "style"
          );
          if (!styleAttr) return;
          const src = context.sourceCode.getText(styleAttr);
          const isFloatingToolbar = src.includes("multiSelectionToolbarPos");
          const isContextMenu = src.includes("canvasContextMenu");
          if (!isFloatingToolbar && !isContextMenu) return;

          const hasStopMouseDown = node.attributes.some(
            (attr) =>
              attr.type === "JSXAttribute" &&
              attr.name?.name === "onMouseDown" &&
              context.sourceCode.getText(attr).includes("stopPropagation")
          );
          if (!hasStopMouseDown) {
            context.report({
              node,
              message: isContextMenu
                ? "白板右键菜单容器必须绑定 onMouseDown={(e) => e.stopPropagation()}，否则点击菜单项时 mousedown 会冒泡到画布 handleMouseDown 提前卸载菜单，导致所有右键功能 onClick 失效。"
                : "多选浮动工具栏容器必须绑定 onMouseDown={(e) => e.stopPropagation()}，否则点击工具栏按钮（如打包新分区/对齐/子白板）时 mousedown 会冒泡到画布并提前清空 selectedObjectIds，导致 onClick 静默失败。",
            });
          }
        },
      };
    },
  },
};

export const whiteboardSelectionEslintConfigs = [
  {
    files: ["electron-renderer/src/features/whiteboard/WhiteboardCanvas.tsx"],
    rules: {
      "local/whiteboard-floating-toolbar-stop-mousedown": "error",
    },
  },
];
