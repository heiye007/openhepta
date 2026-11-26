import tseslint from "typescript-eslint";
import {
  crossBoundaryEslintConfigs,
  crossBoundaryEslintRules,
} from "./001-cross-boundary-isolation/eslint.mjs";
import { checkCrossBoundaryImport } from "./001-cross-boundary-isolation/ast.mjs";
import {
  featureAndLayeringEslintConfigs,
  featureAndLayeringEslintRules,
} from "./002-feature-and-layering/eslint.mjs";
import { checkFeatureAndLayeringImport } from "./002-feature-and-layering/ast.mjs";
import {
  apiAndSqlEslintConfigs,
  apiAndSqlEslintRules,
} from "./003-api-and-sql-boundaries/eslint.mjs";
import { checkApiAndSqlNode } from "./003-api-and-sql-boundaries/ast.mjs";
import {
  noCommentsEslintConfigs,
  noCommentsEslintRules,
} from "./004-no-comments/eslint.mjs";
import {
  checkCodeComments,
  checkCssComments,
} from "./004-no-comments/ast.mjs";
import { noNativeDialogsEslintConfigs } from "./005-no-native-dialogs/eslint.mjs";
import {
  devStartupEslintConfigs,
  devStartupEslintRules,
} from "./006-dev-server-and-electron-startup/eslint.mjs";
import {
  checkDevConfigInvariants,
  checkNoBlindLoadUrlRetry,
} from "./006-dev-server-and-electron-startup/ast.mjs";
import {
  pdfOverlayEslintConfigs,
  pdfOverlayEslintRules,
} from "./007-pdf-overlay-layering/eslint.mjs";
import { checkPdfOverlayInvariants } from "./007-pdf-overlay-layering/ast.mjs";
import {
  ipcBridgeAndFormEslintConfigs,
  ipcBridgeAndFormEslintRules,
} from "./008-ipc-bridge-and-inline-form-guards/eslint.mjs";
import { checkIpcBridgeCompleteness } from "./008-ipc-bridge-and-inline-form-guards/ast.mjs";
import {
  whiteboardStabilityEslintConfigs,
  whiteboardStabilityEslintRules,
} from "./009-whiteboard-connection-and-drag-stability/eslint.mjs";
import { checkWhiteboardStabilityInvariants } from "./009-whiteboard-connection-and-drag-stability/ast.mjs";
import {
  whiteboardSelectionEslintConfigs,
  whiteboardSelectionEslintRules,
} from "./010-whiteboard-selection-and-toolbar-guards/eslint.mjs";
import { checkWhiteboardSelectionInvariants } from "./010-whiteboard-selection-and-toolbar-guards/ast.mjs";
import {
  dropdownOverflowClipEslintConfigs,
  dropdownOverflowClipEslintRules,
} from "./011-dropdown-overflow-clip-guard/eslint.mjs";

export const astImportAnalyzers = [
  checkCrossBoundaryImport,
  checkFeatureAndLayeringImport,
];

export const astNodeAnalyzers = [checkApiAndSqlNode, checkNoBlindLoadUrlRetry];

export {
  checkCodeComments,
  checkCssComments,
  checkDevConfigInvariants,
  checkPdfOverlayInvariants,
  checkIpcBridgeCompleteness,
  checkWhiteboardStabilityInvariants,
  checkWhiteboardSelectionInvariants,
};

export function buildEslintConfig() {
  const localPlugin = {
    rules: {
      ...crossBoundaryEslintRules,
      ...featureAndLayeringEslintRules,
      ...apiAndSqlEslintRules,
      ...noCommentsEslintRules,
      ...devStartupEslintRules,
      ...pdfOverlayEslintRules,
      ...ipcBridgeAndFormEslintRules,
      ...whiteboardStabilityEslintRules,
      ...whiteboardSelectionEslintRules,
      ...dropdownOverflowClipEslintRules,
    },
  };

  return [
    {
      ignores: [
        "dist-electron/**",
        "dist-renderer/**",
        "node_modules/**",
        "src/**",
        "**/*.config.js",
      ],
    },
    {
      files: ["**/*.{ts,tsx}"],
      plugins: {
        local: localPlugin,
      },
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: {
          ecmaVersion: "latest",
          sourceType: "module",
          ecmaFeatures: {
            jsx: true,
          },
        },
      },
    },
    ...noNativeDialogsEslintConfigs,
    ...noCommentsEslintConfigs,
    ...crossBoundaryEslintConfigs,
    ...featureAndLayeringEslintConfigs,
    ...apiAndSqlEslintConfigs,
    ...devStartupEslintConfigs,
    ...pdfOverlayEslintConfigs,
    ...ipcBridgeAndFormEslintConfigs,
    ...whiteboardStabilityEslintConfigs,
    ...whiteboardSelectionEslintConfigs,
    ...dropdownOverflowClipEslintConfigs,
  ];
}
