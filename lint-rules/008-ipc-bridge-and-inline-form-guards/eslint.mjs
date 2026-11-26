function isGetRawApiCall(node) {
  return (
    node &&
    node.type === "CallExpression" &&
    node.callee &&
    node.callee.type === "Identifier" &&
    node.callee.name === "getRawApi"
  );
}

export const ipcBridgeAndFormEslintRules = {
  "inline-tag-input-submit-guard": {
    meta: {
      type: "problem",
      docs: {
        description:
          "Ensure inline tag input handles explicit Enter keyDown and onBlur submission",
      },
      schema: [],
    },
    create(context) {
      return {
        JSXOpeningElement(node) {
          if (node.name?.name !== "input") return;
          const ariaAttr = node.attributes.find(
            (attr) =>
              attr.type === "JSXAttribute" &&
              attr.name?.name === "aria-label" &&
              attr.value?.type === "Literal" &&
              typeof attr.value.value === "string" &&
              attr.value.value.toLowerCase().includes("tag")
          );
          if (!ariaAttr) return;
          const hasOnKeyDown = node.attributes.some(
            (attr) => attr.type === "JSXAttribute" && attr.name?.name === "onKeyDown"
          );
          const hasOnBlur = node.attributes.some(
            (attr) => attr.type === "JSXAttribute" && attr.name?.name === "onBlur"
          );
          if (!hasOnKeyDown || !hasOnBlur) {
            context.report({
              node,
              message:
                "行内标签输入框必须同时绑定 onKeyDown (处理 Enter/Escape) 与 onBlur，防止嵌套表单或失焦时无法提交标签。",
            });
          }
        },
      };
    },
  },

  "ipc-bridge-optional-chaining-guard": {
    meta: {
      type: "problem",
      docs: {
        description:
          "Ensure every getRawApi() member access and invocation in ipcBridge.ts uses full optional chaining (?.)",
      },
      schema: [],
    },
    create(context) {
      return {
        CallExpression(node) {
          if (isGetRawApiCall(node)) return;
          let cur = node.callee;
          let touchesGetRawApi = false;
          let hasNonOptional = !node.optional;

          while (cur && cur.type === "MemberExpression") {
            if (!cur.optional) {
              hasNonOptional = true;
            }
            if (isGetRawApiCall(cur.object)) {
              touchesGetRawApi = true;
              break;
            }
            cur = cur.object;
          }

          if (touchesGetRawApi && hasNonOptional) {
            context.report({
              node,
              message:
                "ipcBridge 中通过 getRawApi() 调用主进程接口时必须使用全链路可选链（如 getRawApi()?.domain?.method?.(...)），防止热更新或旧版 preload 未暴露新方法时抛出 is not a function。",
            });
          }
        },
      };
    },
  },
};

export const ipcBridgeAndFormEslintConfigs = [
  {
    files: ["electron-renderer/src/primitives/card-metadata/HighlightTagChips.tsx"],
    rules: {
      "local/inline-tag-input-submit-guard": "error",
    },
  },
  {
    files: ["electron-renderer/src/client/ipcBridge.ts"],
    rules: {
      "local/ipc-bridge-optional-chaining-guard": "error",
    },
  },
];