import path from "node:path";
import {
  ROOT_DIR,
  getFeatureName,
  resolveImportTarget,
  toPosixPath,
} from "../shared/pathUtils.mjs";

export const featureAndLayeringEslintRules = {
  "feature-and-layering": {
    meta: {
      type: "problem",
      docs: {
        description:
          "Enforce one-folder-per-feature isolation and primitives/client layering",
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
        if (!targetRel) {
          return;
        }

        const sourceFeat = getFeatureName(sourceRel);
        const targetFeat = getFeatureName(targetRel);
        if (sourceFeat) {
          if (targetFeat && targetFeat !== sourceFeat) {
            context.report({
              node,
              message: `Feature "${sourceFeat}" 严禁跨特性导入另一个 Feature "${targetFeat}": "${rawSpecifier}"`,
            });
          } else if (targetRel === "electron-renderer/src/features") {
            context.report({
              node,
              message: `Feature "${sourceFeat}" 严禁从 features 根聚合出口导入: "${rawSpecifier}"`,
            });
          }
        }

        if (sourceRel.startsWith("electron-renderer/src/primitives/")) {
          if (
            targetRel === "electron-renderer/src/features" ||
            targetRel.startsWith("electron-renderer/src/features/")
          ) {
            context.report({
              node,
              message: `primitives 严禁导入 features: "${rawSpecifier}"`,
            });
          }
          if (
            targetRel === "electron-renderer/src/client" ||
            targetRel.startsWith("electron-renderer/src/client/")
          ) {
            context.report({
              node,
              message: `primitives 严禁直接导入 client: "${rawSpecifier}"`,
            });
          }
        }

        if (sourceRel.startsWith("electron-renderer/src/client/")) {
          if (
            targetRel === "electron-renderer/src/features" ||
            targetRel.startsWith("electron-renderer/src/features/")
          ) {
            context.report({
              node,
              message: `client 严禁导入 features: "${rawSpecifier}"`,
            });
          }
          if (
            targetRel === "electron-renderer/src/primitives" ||
            targetRel.startsWith("electron-renderer/src/primitives/")
          ) {
            context.report({
              node,
              message: `client 严禁导入 primitives: "${rawSpecifier}"`,
            });
          }
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

export const featureAndLayeringEslintConfigs = [
  {
    files: ["electron-renderer/**/*.{ts,tsx}"],
    rules: {
      "local/feature-and-layering": "error",
    },
  },
];
