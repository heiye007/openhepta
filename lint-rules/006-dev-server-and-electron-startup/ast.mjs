import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export function checkNoBlindLoadUrlRetry({
  node,
  relPath,
  sourceFile,
  violations,
}) {
  if (!relPath.startsWith("electron-main/")) {
    return;
  }
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "loadURL"
  ) {
    let cur = node.parent;
    while (cur) {
      if (
        ts.isCallExpression(cur) &&
        ts.isIdentifier(cur.expression) &&
        (cur.expression.text === "setTimeout" ||
          cur.expression.text === "setInterval")
      ) {
        const lc = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile)
        );
        violations.push({
          file: relPath,
          line: lc.line + 1,
          column: lc.character + 1,
          rule: "no-blind-loadurl-retry",
          message:
            "Do not call loadURL inside setTimeout/setInterval retry loops; probe dev server HTTP readiness before loadURL.",
        });
        break;
      }
      cur = cur.parent;
    }
  }
}

export function checkDevConfigInvariants(rootDir, violations) {
  const pkgPath = path.join(rootDir, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      const devScript = String(pkg?.scripts?.dev || "");
      if (devScript.includes("electron")) {
        const hasCleanEnvLauncher =
          devScript.includes("cli/dev-electron.mjs") ||
          devScript.includes("delete e.ELECTRON_RUN_AS_NODE") ||
          devScript.includes("delete env.ELECTRON_RUN_AS_NODE");
        if (!hasCleanEnvLauncher) {
          violations.push({
            file: "package.json",
            line: 1,
            column: 1,
            rule: "dev-electron-env-guard",
            message:
              'scripts.dev must launch electron via cli/dev-electron.mjs (or delete ELECTRON_RUN_AS_NODE from env) before launching electron.',
          });
        }
        if (
          !devScript.includes("tsconfig.electron.json") &&
          !devScript.includes("build:electron")
        ) {
          violations.push({
            file: "package.json",
            line: 1,
            column: 1,
            rule: "dev-electron-build-guard",
            message:
              "scripts.dev must build electron-main (tsconfig.electron.json / build:electron) before launching electron.",
          });
        }
      }
    } catch (err) {
      violations.push({
        file: "package.json",
        line: 1,
        column: 1,
        rule: "dev-config-parse",
        message: `Failed to parse package.json: ${err.message}`,
      });
    }
  }

  const vitePath = fs.existsSync(path.join(rootDir, "vite.config.mts"))
    ? path.join(rootDir, "vite.config.mts")
    : path.join(rootDir, "vite.config.ts");
  const viteFileLabel = path.basename(vitePath);
  if (fs.existsSync(vitePath)) {
    const viteText = fs.readFileSync(vitePath, "utf8");
    if (!viteText.includes("optimizeDeps")) {
      violations.push({
        file: viteFileLabel,
        line: 1,
        column: 1,
        rule: "vite-optimize-deps-guard",
        message:
          "vite.config.mts must define optimizeDeps (include core deps / exclude pdfjs-dist) to avoid repeated dev-mode reloads and stuttering.",
      });
    }
    if (
      !viteText.includes("ignored") ||
      !viteText.includes("dist-electron")
    ) {
      violations.push({
        file: viteFileLabel,
        line: 1,
        column: 1,
        rule: "vite-watch-ignore-guard",
        message:
          "vite.config.mts must configure server.watch.ignored including dist-electron/ so Vite does not watch build artifacts.",
      });
    }
  }
}
