import path from "node:path";
import {
  ROOT_DIR,
  RAW_SQL_PATTERN,
  toPosixPath,
} from "../shared/pathUtils.mjs";
import { nativeDialogRestrictedProperties } from "../005-no-native-dialogs/eslint.mjs";

export const apiAndSqlEslintRules = {
  "no-renderer-raw-sql": {
    meta: {
      type: "problem",
      docs: {
        description: "Disallow raw SQL strings inside electron-renderer",
      },
      schema: [],
    },
    create(context) {
      const rawFilename = context.filename ?? context.getFilename();
      const absPath = path.isAbsolute(rawFilename)
        ? rawFilename
        : path.resolve(ROOT_DIR, rawFilename);
      const sourceRel = toPosixPath(path.relative(ROOT_DIR, absPath));

      if (!sourceRel.startsWith("electron-renderer/")) {
        return {};
      }

      return {
        Literal(node) {
          if (typeof node.value === "string" && RAW_SQL_PATTERN.test(node.value)) {
            context.report({
              node,
              message:
                "electron-renderer 中严禁编写原生 SQL 语句，请通过 client / preload 领域 API 调用。",
            });
          }
        },
        TemplateLiteral(node) {
          const combined = node.quasis
            .map((q) => q.value.cooked ?? q.value.raw)
            .join("__EXPR__");
          if (RAW_SQL_PATTERN.test(combined)) {
            context.report({
              node,
              message:
                "electron-renderer 中严禁编写原生 SQL 语句，请通过 client / preload 领域 API 调用。",
            });
          }
        },
      };
    },
  },
};

export const apiAndSqlEslintConfigs = [
  {
    files: ["electron-renderer/**/*.{ts,tsx}"],
    rules: {
      "local/no-renderer-raw-sql": "error",
    },
  },
  {
    files: [
      "electron-renderer/src/features/**/*.{ts,tsx}",
      "electron-renderer/src/primitives/**/*.{ts,tsx}",
      "electron-renderer/src/App.tsx",
      "electron-renderer/src/main.tsx",
    ],
    rules: {
      "no-restricted-properties": [
        "error",
        ...nativeDialogRestrictedProperties,
        {
          object: "window",
          property: "heptaElectronApi",
          message:
            "禁止在 client/ 之外直接访问 window.heptaElectronApi，请使用 client/ 中的 heptaClient。",
        },
        {
          object: "globalThis",
          property: "heptaElectronApi",
          message:
            "禁止在 client/ 之外直接访问 globalThis.heptaElectronApi，请使用 client/ 中的 heptaClient。",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "Identifier[name='heptaElectronApi']",
          message:
            "禁止在 client/ 之外直接访问 heptaElectronApi，请使用 client/ 中的 heptaClient。",
        },
      ],
    },
  },
];
