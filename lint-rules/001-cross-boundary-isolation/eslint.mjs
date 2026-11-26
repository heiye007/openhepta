import path from "node:path";
import {
  ROOT_DIR,
  resolveImportTarget,
  toPosixPath,
} from "../shared/pathUtils.mjs";

export const crossBoundaryEslintRules = {
  "cross-boundary-isolation": {
    meta: {
      type: "problem",
      docs: {
        description:
          "Enforce strict isolation between electron-main, electron-renderer, shared, and legacy src/",
      },
      schema: [],
    },
    create(context) {
      const rawFilename = context.filename ?? context.getFilename();
      const absPath = path.isAbsolute(rawFilename)
        ? rawFilename
        : path.resolve(ROOT_DIR, rawFilename);
      const sourceRel = toPosixPath(path.relative(ROOT_DIR, absPath));

      const checkSpecifier = (node, rawSpecifier) => {
        if (typeof rawSpecifier !== "string") {
          return;
        }
        const targetRel = resolveImportTarget(absPath, rawSpecifier);
        const mentionsMain =
          (targetRel &&
            (targetRel === "electron-main" ||
              targetRel.startsWith("electron-main/"))) ||
          /(^|\/)electron-main(\/|$)/.test(rawSpecifier);
        const mentionsRenderer =
          (targetRel &&
            (targetRel === "electron-renderer" ||
              targetRel.startsWith("electron-renderer/"))) ||
          /(^|\/)electron-renderer(\/|$)/.test(rawSpecifier);
        const mentionsLegacySrc =
          targetRel && (targetRel === "src" || targetRel.startsWith("src/"));

        if (mentionsLegacySrc) {
          context.report({
            node,
            message: `禁止从旧目录 "src/" 导入模块: "${rawSpecifier}"`,
          });
        }
        if (sourceRel.startsWith("electron-renderer/") && mentionsMain) {
          context.report({
            node,
            message: `electron-renderer 严禁导入 electron-main 中的任何代码或类型: "${rawSpecifier}"`,
          });
        }
        if (sourceRel.startsWith("electron-main/") && mentionsRenderer) {
          context.report({
            node,
            message: `electron-main 严禁导入 electron-renderer 中的任何代码或类型: "${rawSpecifier}"`,
          });
        }
        if (
          sourceRel.startsWith("shared/") &&
          (mentionsMain || mentionsRenderer)
        ) {
          context.report({
            node,
            message: `shared 严禁导入 electron-main 或 electron-renderer: "${rawSpecifier}"`,
          });
        }
      };

      return {
        ImportDeclaration(node) {
          if (node.source && typeof node.source.value === "string") {
            checkSpecifier(node.source, node.source.value);
          }
        },
        ExportNamedDeclaration(node) {
          if (node.source && typeof node.source.value === "string") {
            checkSpecifier(node.source, node.source.value);
          }
        },
        ExportAllDeclaration(node) {
          if (node.source && typeof node.source.value === "string") {
            checkSpecifier(node.source, node.source.value);
          }
        },
        ImportExpression(node) {
          if (node.source && typeof node.source.value === "string") {
            checkSpecifier(node.source, node.source.value);
          }
        },
        TSImportType(node) {
          const arg = node.argument;
          if (arg && arg.type === "TSLiteralType" && arg.literal) {
            checkSpecifier(arg, arg.literal.value);
          }
        },
        CallExpression(node) {
          if (
            node.callee.type === "Identifier" &&
            node.callee.name === "require" &&
            node.arguments.length > 0 &&
            node.arguments[0].type === "Literal" &&
            typeof node.arguments[0].value === "string"
          ) {
            checkSpecifier(node.arguments[0], node.arguments[0].value);
          }
        },
      };
    },
  },
};

export const crossBoundaryEslintConfigs = [
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "local/cross-boundary-isolation": "error",
    },
  },
  {
    files: ["electron-renderer/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/electron-main",
                "**/electron-main/**",
                "electron-main",
                "electron-main/**",
                "@main",
                "@main/**",
              ],
              message:
                "electron-renderer 严禁导入 electron-main 中的任何模块或类型。",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["electron-main/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/electron-renderer",
                "**/electron-renderer/**",
                "electron-renderer",
                "electron-renderer/**",
                "@renderer",
                "@renderer/**",
                "@/*",
              ],
              message:
                "electron-main 严禁导入 electron-renderer 中的任何模块或类型。",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/electron-main",
                "**/electron-main/**",
                "electron-main",
                "electron-main/**",
                "**/electron-renderer",
                "**/electron-renderer/**",
                "electron-renderer",
                "electron-renderer/**",
                "@main",
                "@main/**",
                "@renderer",
                "@renderer/**",
                "@/*",
              ],
              message:
                "shared 严禁导入 electron-main 或 electron-renderer 中的任何模块。",
            },
          ],
        },
      ],
    },
  },
];
