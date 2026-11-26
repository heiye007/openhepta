import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  ROOT_DIR,
  getRelativeToRoot,
  resolveImportTarget,
} from "./shared/pathUtils.mjs";
import {
  astImportAnalyzers,
  astNodeAnalyzers,
  checkCodeComments,
  checkCssComments,
  checkDevConfigInvariants,
  checkPdfOverlayInvariants,
  checkIpcBridgeCompleteness,
  checkWhiteboardStabilityInvariants,
  checkWhiteboardSelectionInvariants,
} from "./index.mjs";

const TARGET_ROOTS = ["electron-main", "electron-renderer", "shared"];
const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);
const CSS_EXTENSIONS = new Set([".css"]);

function getScriptKind(ext) {
  switch (ext) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".js":
    case ".mjs":
    case ".cjs":
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

function collectFiles(dirPath, acc = []) {
  if (!fs.existsSync(dirPath)) {
    return acc;
  }
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (
      entry.name === "node_modules" ||
      entry.name === "dist-electron" ||
      entry.name === "dist-renderer" ||
      entry.name.startsWith(".")
    ) {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, acc);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (CODE_EXTENSIONS.has(ext) || CSS_EXTENSIONS.has(ext)) {
        acc.push(fullPath);
      }
    }
  }
  return acc;
}

function runImportAnalyzers(
  sourceRel,
  sourceAbs,
  rawSpecifier,
  node,
  sourceFile,
  violations
) {
  const lc = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile)
  );
  const ctx = {
    sourceRel,
    sourceAbs,
    rawSpecifier,
    targetRel: resolveImportTarget(sourceAbs, rawSpecifier),
    line: lc.line + 1,
    column: lc.character + 1,
    violations,
  };
  for (const analyzeImport of astImportAnalyzers) {
    analyzeImport(ctx);
  }
}

function analyzeCodeFile(absPath, code, violations) {
  const relPath = getRelativeToRoot(absPath);
  const ext = path.extname(absPath).toLowerCase();
  const sourceFile = ts.createSourceFile(
    absPath,
    code,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(ext)
  );

  checkCodeComments(sourceFile, code, relPath, violations);

  const isRenderer = relPath.startsWith("electron-renderer/");
  const isAllowedDirectApiFile =
    relPath.startsWith("electron-renderer/src/client/") ||
    relPath === "electron-renderer/src/env.d.ts";

  const visit = (node) => {
    if (
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      runImportAnalyzers(
        relPath,
        absPath,
        node.moduleSpecifier.text,
        node.moduleSpecifier,
        sourceFile,
        violations
      );
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      runImportAnalyzers(
        relPath,
        absPath,
        node.moduleSpecifier.text,
        node.moduleSpecifier,
        sourceFile,
        violations
      );
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      runImportAnalyzers(
        relPath,
        absPath,
        node.moduleReference.expression.text,
        node.moduleReference.expression,
        sourceFile,
        violations
      );
    } else if (ts.isCallExpression(node)) {
      const isDynamicImport =
        node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire =
        ts.isIdentifier(node.expression) && node.expression.text === "require";
      if (
        (isDynamicImport || isRequire) &&
        node.arguments.length > 0 &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        runImportAnalyzers(
          relPath,
          absPath,
          node.arguments[0].text,
          node.arguments[0],
          sourceFile,
          violations
        );
      }
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      runImportAnalyzers(
        relPath,
        absPath,
        node.argument.literal.text,
        node.argument.literal,
        sourceFile,
        violations
      );
    }

    for (const analyzeNode of astNodeAnalyzers) {
      analyzeNode({
        node,
        relPath,
        sourceFile,
        isRenderer,
        isAllowedDirectApiFile,
        violations,
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

function analyzeFileOnDisk(absPath, violations) {
  const ext = path.extname(absPath).toLowerCase();
  const code = fs.readFileSync(absPath, "utf8");
  const relPath = getRelativeToRoot(absPath);
  if (CSS_EXTENSIONS.has(ext)) {
    checkCssComments(code, relPath, violations);
  } else if (CODE_EXTENSIONS.has(ext)) {
    analyzeCodeFile(absPath, code, violations);
  }
}

function main() {
  const args = process.argv.slice(2);
  const violations = [];

  if (args.includes("--stdin")) {
    let filename = "electron-renderer/src/test.ts";
    const fnIdx = args.findIndex(
      (a) => a === "--filename" || a === "--stdin-filename"
    );
    if (fnIdx !== -1 && args[fnIdx + 1]) {
      filename = args[fnIdx + 1];
    }
    const absPath = path.resolve(ROOT_DIR, filename);
    const code = fs.readFileSync(0, "utf8");
    const ext = path.extname(absPath).toLowerCase();
    if (CSS_EXTENSIONS.has(ext)) {
      checkCssComments(code, getRelativeToRoot(absPath), violations);
    } else {
      analyzeCodeFile(absPath, code, violations);
    }
  } else {
    const targetPaths =
      args.length > 0
        ? args.map((p) => path.resolve(ROOT_DIR, p))
        : TARGET_ROOTS.map((r) => path.join(ROOT_DIR, r));

    let scannedCount = 0;
    for (const targetPath of targetPaths) {
      if (!fs.existsSync(targetPath)) {
        continue;
      }
      const stat = fs.statSync(targetPath);
      if (stat.isFile()) {
        analyzeFileOnDisk(targetPath, violations);
        scannedCount++;
      } else if (stat.isDirectory()) {
        const files = collectFiles(targetPath);
        for (const file of files) {
          analyzeFileOnDisk(file, violations);
          scannedCount++;
        }
      }
    }

    if (args.length === 0) {
      checkDevConfigInvariants(ROOT_DIR, violations);
      checkPdfOverlayInvariants(ROOT_DIR, violations);
      checkIpcBridgeCompleteness(ROOT_DIR, violations);
      checkWhiteboardStabilityInvariants(ROOT_DIR, violations);
      checkWhiteboardSelectionInvariants(ROOT_DIR, violations);
    }

    if (scannedCount === 0) {
      console.error(
        "[check-architecture] No files found to scan in target roots."
      );
      process.exit(1);
    }
  }

  if (violations.length > 0) {
    for (const v of violations) {
      console.error(
        `${v.file}:${v.line}:${v.column}  error  [${v.rule}] ${v.message}`
      );
    }
    console.error(
      `\n✖ ${violations.length} architecture violation(s) found.`
    );
    process.exit(1);
  }
}

main();
