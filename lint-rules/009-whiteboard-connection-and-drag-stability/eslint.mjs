export const whiteboardStabilityEslintRules = {
  "whiteboard-connection-no-transition-all": {
    meta: {
      type: "problem",
      docs: {
        description:
          "Forbid transition-all and animate-pulse on SVG <path> elements in ConnectionLayer to prevent lag and jitter while moving cards or dragging connections",
      },
      schema: [],
    },
    create(context) {
      return {
        JSXOpeningElement(node) {
          if (node.name?.type !== "JSXIdentifier" || node.name.name !== "path") {
            return;
          }
          const classAttr = node.attributes.find(
            (attr) =>
              attr.type === "JSXAttribute" &&
              attr.name?.name === "className" &&
              attr.value?.type === "Literal" &&
              typeof attr.value.value === "string"
          );
          if (!classAttr) return;
          const cls = classAttr.value.value;
          if (/\btransition-all\b/.test(cls)) {
            context.report({
              node: classAttr,
              message:
                "ConnectionLayer 的 SVG <path> 禁止使用 transition-all（会导致拖动卡片时连线产生 150ms 拖影滞后与跳动），请改用 transition-opacity 或 transition-colors。",
            });
          }
          if (/\banimate-pulse\b/.test(cls)) {
            context.report({
              node: classAttr,
              message:
                "ConnectionLayer 的拖拽预览线 <path> 禁止使用 animate-pulse（会导致连线拖拽时闪烁跳动）。",
            });
          }
        },
      };
    },
  },

  "whiteboard-connection-no-hardcoded-active-end-dir": {
    meta: {
      type: "problem",
      docs: {
        description:
          "Forbid hardcoding a literal endDirection when calling getConnectionPath with activeConnectLine",
      },
      schema: [],
    },
    create(context) {
      return {
        CallExpression(node) {
          if (
            node.callee?.type !== "Identifier" ||
            node.callee.name !== "getConnectionPath" ||
            node.arguments.length < 5
          ) {
            return;
          }
          const fourthArg = node.arguments[3];
          const fifthArg = node.arguments[4];
          const usesActiveConnectLine =
            fourthArg?.type === "MemberExpression" &&
            fourthArg.object?.type === "Identifier" &&
            fourthArg.object.name === "activeConnectLine";
          if (
            usesActiveConnectLine &&
            fifthArg?.type === "Literal" &&
            typeof fifthArg.value === "string"
          ) {
            context.report({
              node: fifthArg,
              message:
                "渲染 activeConnectLine 预览线时禁止将 getConnectionPath 的终点切线方向硬编码为字面量（如 'left'），否则拖向其他方向及松手落点时会剧烈跳动。请根据起终点方向动态计算并在悬停目标时磁吸对齐。",
            });
          }
        },
      };
    },
  },

  "whiteboard-connection-lock-auto-anchor": {
    meta: {
      type: "problem",
      docs: {
        description:
          "Require ConnectionLayer 'auto' anchors to lock both beginDir and endDir per connection id so moving cards never flips anchor sides",
      },
      schema: [],
    },
    create(context) {
      return {
        CallExpression(node) {
          if (
            node.callee?.type === "MemberExpression" &&
            node.callee.property?.type === "Identifier" &&
            node.callee.property.name === "set" &&
            node.callee.object?.type === "MemberExpression" &&
            node.callee.object.property?.type === "Identifier" &&
            node.callee.object.property.name === "current" &&
            node.callee.object.object?.type === "Identifier" &&
            node.callee.object.object.name === "resolvedAutoAxisRef"
          ) {
            const valueArg = node.arguments[1];
            const hasBeginAndEndDir =
              valueArg?.type === "ObjectExpression" &&
              valueArg.properties.some(
                (p) => p.type === "Property" && p.key?.type === "Identifier" && p.key.name === "beginDir"
              ) &&
              valueArg.properties.some(
                (p) => p.type === "Property" && p.key?.type === "Identifier" && p.key.name === "endDir"
              );
            if (!hasBeginAndEndDir) {
              context.report({
                node: valueArg || node,
                message:
                  "resolvedAutoAxisRef.current.set(...) 必须锁定具体起止方向 { beginDir, endDir }（禁止仅缓存 'horizontal'/'vertical' 或在拖动时按滞回动态重算），否则拖动旧版 'auto' 连线卡片时锚点仍会跨边翻转跳动。",
              });
            }
          }

          if (
            node.callee?.type === "Identifier" &&
            node.callee.name === "getObjectAnchor" &&
            node.arguments.length >= 3 &&
            node.arguments.length < 5
          ) {
            context.report({
              node,
              message:
                "调用 getObjectAnchor 传入 targetObj 时（'auto' 路径）必须同时传入第 4 参数 conn.id 与第 5 参数 isSource（boolean），确保起止两端共享同一份锁定的 (beginDir, endDir) 锚点方向。",
            });
          }
        },
      };
    },
  },
};

export const whiteboardStabilityEslintConfigs = [
  {
    files: ["electron-renderer/src/features/whiteboard/ConnectionLayer.tsx"],
    rules: {
      "local/whiteboard-connection-no-transition-all": "error",
      "local/whiteboard-connection-no-hardcoded-active-end-dir": "error",
      "local/whiteboard-connection-lock-auto-anchor": "error",
    },
  },
];
