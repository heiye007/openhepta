export const devStartupEslintRules = {
  "no-blind-loadurl-retry": {
    meta: {
      type: "problem",
      docs: {
        description:
          "Disallow calling webContents/BrowserWindow loadURL inside timer retry loops",
      },
      schema: [],
    },
    create(context) {
      return {
        CallExpression(node) {
          if (
            node.callee.type === "MemberExpression" &&
            node.callee.property.type === "Identifier" &&
            node.callee.property.name === "loadURL"
          ) {
            let cur = node.parent;
            while (cur) {
              if (
                cur.type === "CallExpression" &&
                cur.callee.type === "Identifier" &&
                (cur.callee.name === "setTimeout" ||
                  cur.callee.name === "setInterval")
              ) {
                context.report({
                  node,
                  message:
                    "禁止在 setTimeout/setInterval 中盲目重试 loadURL（会导致反复触发 did-fail-load 与页面闪烁卡顿），请先在主进程 HTTP 探测 Dev Server 就绪。",
                });
                break;
              }
              cur = cur.parent;
            }
          }
        },
      };
    },
  },
};

export const devStartupEslintConfigs = [
  {
    files: ["electron-main/**/*.{ts,tsx}"],
    rules: {
      "local/no-blind-loadurl-retry": "error",
    },
  },
];
