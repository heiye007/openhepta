function extractStaticClassName(jsxOpeningElement) {
  const attr = jsxOpeningElement.attributes?.find(
    (a) => a.type === "JSXAttribute" && a.name?.name === "className"
  );
  if (!attr || !attr.value) return "";
  if (attr.value.type === "Literal" && typeof attr.value.value === "string") {
    return attr.value.value;
  }
  if (attr.value.type === "JSXExpressionContainer") {
    const expr = attr.value.expression;
    if (expr.type === "Literal" && typeof expr.value === "string") {
      return expr.value;
    }
    if (expr.type === "TemplateLiteral") {
      return expr.quasis.map((q) => q.value.raw).join(" ");
    }
  }
  return "";
}

function hasRoleMenu(jsxOpeningElement) {
  return jsxOpeningElement.attributes?.some(
    (a) =>
      a.type === "JSXAttribute" &&
      a.name?.name === "role" &&
      a.value?.type === "Literal" &&
      a.value.value === "menu"
  );
}

function isFloatingDropdownMenu(openingEl) {
  const cls = extractStaticClassName(openingEl);
  if (!/\babsolute\b/.test(cls)) return false;
  if (hasRoleMenu(openingEl)) return true;
  const hasMenuSurface = /\bbg-menu-bg\b/.test(cls);
  const hasMenuElevation = /\b(z-50|z-\[50\]|z-\[100\]|shadow-main|shadow-xl|shadow-float)\b/.test(cls);
  return hasMenuSurface && hasMenuElevation;
}

function isFullPageLayoutShell(cls) {
  return /\b(h-full|h-screen|min-h-screen|flex-1|inset-0|w-screen)\b/.test(cls) || /\bh-\[\d+vh\]/.test(cls);
}

export const dropdownOverflowClipEslintRules = {
  "no-dropdown-inside-overflow-hidden": {
    meta: {
      type: "problem",
      docs: {
        description:
          "Forbid rendering absolute floating dropdown menus inside card/thumbnail ancestors with overflow-hidden, which clips menu items",
      },
      schema: [],
    },
    create(context) {
      return {
        JSXElement(node) {
          if (!isFloatingDropdownMenu(node.openingElement)) {
            return;
          }

          let current = node.parent;
          let depth = 0;
          while (current && depth < 8) {
            if (current.type === "JSXElement") {
              depth += 1;
              const ancestorCls = extractStaticClassName(current.openingElement);
              if (
                /\boverflow-hidden\b/.test(ancestorCls) &&
                !isFullPageLayoutShell(ancestorCls)
              ) {
                context.report({
                  node: current.openingElement,
                  message:
                    "禁止在带有 overflow-hidden 的卡片或局部容器内渲染 absolute 下拉菜单（会导致菜单项被父容器裁切遮挡）。请将 overflow-hidden 下沉至缩略图/内容内层，或在菜单展开时移除外层 overflow-hidden 并提升 z-index。",
                });
                return;
              }
            }
            current = current.parent;
          }
        },
      };
    },
  },

  "editor-overlay-menu-use-portal": {
    meta: {
      type: "problem",
      docs: {
        description:
          "Require SlashMenu, MentionMenu, and WhiteboardPickerMenu in FloatingOverlays.tsx to render via createPortal with position: fixed so parent card/journal containers cannot clip them",
      },
      schema: [],
    },
    create(context) {
      const TARGET_MENUS = new Set([
        "SlashMenu",
        "MentionMenu",
        "WhiteboardPickerMenu",
      ]);

      return {
        FunctionDeclaration(node) {
          if (!node.id || !TARGET_MENUS.has(node.id.name)) return;
          const fnText = context.sourceCode.getText(node);
          if (
            !fnText.includes("createPortal(") ||
            !/position:\s*['"]fixed['"]/.test(fnText) ||
            !fnText.includes("onWheel")
          ) {
            context.report({
              node: node.id,
              message: `${node.id.name} 必须通过 createPortal(..., document.body) 配合 position: 'fixed' 与 onWheel={(e) => e.stopPropagation()} 渲染，防止在 Journal / 白板卡片中被裁切，以及滚动菜单时事件冒泡导致白板画布跟着滚动。`,
            });
          }
        },
      };
    },
  },

  "no-bottom-toolbar-menu-downward-clip": {
    meta: {
      type: "problem",
      docs: {
        description:
          "Forbid opening absolute floating menus downward (top-0 / top-full) from bottom-anchored bars or the last item of a vertical floating toolbar, which clips menu items at the bottom edge of the viewport",
      },
      schema: [],
    },
    create(context) {
      function isLastJsxElementChild(parentEl, childEl) {
        if (!parentEl || !Array.isArray(parentEl.children)) return false;
        const jsxChildren = parentEl.children.filter((c) => c.type === "JSXElement");
        return jsxChildren.length > 1 && jsxChildren[jsxChildren.length - 1] === childEl;
      }

      return {
        JSXElement(node) {
          if (!isFloatingDropdownMenu(node.openingElement)) {
            return;
          }
          const menuCls = extractStaticClassName(node.openingElement);
          const opensDownward = /\btop-(0|full|\d+)\b/.test(menuCls) && !/\bbottom-/.test(menuCls);
          if (!opensDownward) {
            return;
          }

          let prevJsxEl = node;
          let current = node.parent;
          let depth = 0;
          while (current && depth < 6) {
            if (current.type === "JSXElement") {
              depth += 1;
              const ancestorCls = extractStaticClassName(current.openingElement);
              const isBottomAnchoredBar =
                /\b(absolute|fixed)\b/.test(ancestorCls) &&
                /\bbottom-(\d+|\[[^\]]+\])\b/.test(ancestorCls);
              const isVerticalFloatingToolbar =
                /\b(absolute|fixed)\b/.test(ancestorCls) &&
                /\bflex-col\b/.test(ancestorCls) &&
                /\b(left|right)-\d+\b/.test(ancestorCls) &&
                isLastJsxElementChild(current, prevJsxEl);

              if (isBottomAnchoredBar || isVerticalFloatingToolbar) {
                context.report({
                  node: node.openingElement,
                  message:
                    "位于视口底部或纵向浮动工具栏最末端的 absolute 浮层菜单禁止使用 top-0 / top-full 向下展开（会导致底部菜单项超出窗口被截断）。请改为 bottom-0 / bottom-11 向上展开，并按需补充 max-h-[calc(100vh-80px)] overflow-y-auto。",
                });
                return;
              }
              prevJsxEl = current;
            }
            current = current.parent;
          }
        },
      };
    },
  },

  "whiteboard-wheel-yields-to-editor-menus": {
    meta: {
      type: "problem",
      docs: {
        description:
          "Require WhiteboardCanvas handleWheel to yield and forward wheel scrolling when an editor overlay menu (SlashMenu / MentionMenu / WhiteboardPickerMenu) is open",
      },
      schema: [],
    },
    create(context) {
      return {
        VariableDeclarator(node) {
          if (node.id?.type !== "Identifier" || node.id.name !== "handleWheel") {
            return;
          }
          const fnText = context.sourceCode.getText(node);
          const guardsOpenMenus =
            fnText.includes("document.querySelector") &&
            fnText.includes(".hepta-slash-menu") &&
            fnText.includes(".hepta-mention-menu") &&
            fnText.includes(".hepta-whiteboard-picker");
          if (!guardsOpenMenus) {
            context.report({
              node: node.id,
              message:
                "WhiteboardCanvas.tsx 的 handleWheel 必须通过 document.querySelector 检测当前是否打开了 .hepta-slash-menu / .hepta-mention-menu / .hepta-whiteboard-picker 并拦截转发滚轮，防止鼠标停留在卡片上滚动时把白板滚走导致固定定位菜单脱节。",
            });
          }
        },
      };
    },
  },
};

export const dropdownOverflowClipEslintConfigs = [
  {
    files: ["electron-renderer/src/**/*.{ts,tsx}"],
    rules: {
      "local/no-dropdown-inside-overflow-hidden": "error",
      "local/no-bottom-toolbar-menu-downward-clip": "error",
    },
  },
  {
    files: ["electron-renderer/src/primitives/card-editor/prosemirror/FloatingOverlays.tsx"],
    rules: {
      "local/editor-overlay-menu-use-portal": "error",
    },
  },
  {
    files: ["electron-renderer/src/features/whiteboard/WhiteboardCanvas.tsx"],
    rules: {
      "local/whiteboard-wheel-yields-to-editor-menus": "error",
    },
  },
];
