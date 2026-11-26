import ts from "typescript";
import { RAW_SQL_PATTERN } from "../shared/pathUtils.mjs";

export function checkApiAndSqlNode({
  node,
  relPath,
  sourceFile,
  isRenderer,
  isAllowedDirectApiFile,
  violations,
}) {
  if (isRenderer && !isAllowedDirectApiFile) {
    if (ts.isIdentifier(node) && node.text === "heptaElectronApi") {
      const lc = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile)
      );
      violations.push({
        file: relPath,
        line: lc.line + 1,
        column: lc.character + 1,
        rule: "no-direct-electron-api",
        message:
          'Direct reference to "heptaElectronApi" is forbidden outside electron-renderer/src/client/ (use heptaClient instead).',
      });
    } else if (
      ts.isStringLiteralLike(node) &&
      node.text === "heptaElectronApi" &&
      node.parent &&
      ts.isElementAccessExpression(node.parent)
    ) {
      const lc = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile)
      );
      violations.push({
        file: relPath,
        line: lc.line + 1,
        column: lc.character + 1,
        rule: "no-direct-electron-api",
        message:
          'Direct reference to "heptaElectronApi" is forbidden outside electron-renderer/src/client/ (use heptaClient instead).',
      });
    }
  }

  if (isRenderer) {
    let textToCheck = null;
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      textToCheck = node.text;
    } else if (ts.isTemplateExpression(node)) {
      textToCheck =
        node.head.text +
        node.templateSpans.map((s) => `__EXPR__${s.literal.text}`).join("");
    }
    if (textToCheck && RAW_SQL_PATTERN.test(textToCheck)) {
      const lc = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile)
      );
      violations.push({
        file: relPath,
        line: lc.line + 1,
        column: lc.character + 1,
        rule: "no-renderer-raw-sql",
        message: `Raw SQL query string is forbidden in electron-renderer: "${textToCheck
          .replace(/\s+/g, " ")
          .slice(0, 80)}"`,
      });
    }
  }
}
