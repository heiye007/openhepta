import ts from "typescript";

export function checkCodeComments(sourceFile, code, relPath, violations) {
  const chars = Array.from(code);
  const blankRange = (start, end) => {
    const clampedStart = Math.max(0, start);
    const clampedEnd = Math.min(chars.length, end);
    for (let i = clampedStart; i < clampedEnd; i++) {
      if (chars[i] !== "\n" && chars[i] !== "\r") {
        chars[i] = " ";
      }
    }
  };

  const visitLiterals = (node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      node.kind === ts.SyntaxKind.RegularExpressionLiteral ||
      node.kind === ts.SyntaxKind.JsxText
    ) {
      blankRange(node.getStart(sourceFile), node.getEnd());
    } else if (ts.isTemplateHead(node)) {
      blankRange(node.getStart(sourceFile), node.getEnd() - 2);
    } else if (ts.isTemplateMiddle(node)) {
      blankRange(node.getStart(sourceFile) + 1, node.getEnd() - 2);
    } else if (ts.isTemplateTail(node)) {
      blankRange(node.getStart(sourceFile) + 1, node.getEnd());
    }
    ts.forEachChild(node, visitLiterals);
  };

  visitLiterals(sourceFile);

  const masked = chars.join("");
  const commentRegex = new RegExp("//[^\\r\\n]*|/\\*[\\s\\S]*?\\*/", "g");
  let match;
  while ((match = commentRegex.exec(masked)) !== null) {
    const lc = sourceFile.getLineAndCharacterOfPosition(match.index);
    const preview = match[0].split(/\r?\n/)[0].slice(0, 60);
    violations.push({
      file: relPath,
      line: lc.line + 1,
      column: lc.character + 1,
      rule: "no-comments",
      message: `Comments are forbidden in code: ${preview}`,
    });
  }
}

export function checkCssComments(code, relPath, violations) {
  const chars = Array.from(code);
  let i = 0;
  let inQuote = null;
  while (i < chars.length) {
    const ch = chars[i];
    if (inQuote) {
      if (ch === "\\" && i + 1 < chars.length) {
        if (chars[i] !== "\n" && chars[i] !== "\r") chars[i] = " ";
        i++;
        if (chars[i] !== "\n" && chars[i] !== "\r") chars[i] = " ";
        i++;
        continue;
      }
      if (ch === inQuote) {
        inQuote = null;
      }
      if (ch !== "\n" && ch !== "\r") {
        chars[i] = " ";
      }
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      chars[i] = " ";
      i++;
      continue;
    }
    i++;
  }

  const masked = chars.join("");
  const blockCommentRegex = new RegExp("/\\*[\\s\\S]*?\\*/", "g");
  let match;
  while ((match = blockCommentRegex.exec(masked)) !== null) {
    const prefix = code.slice(0, match.index);
    const lines = prefix.split(/\r?\n/);
    const line = lines.length;
    const column = lines[lines.length - 1].length + 1;
    const preview = match[0].split(/\r?\n/)[0].slice(0, 60);
    violations.push({
      file: relPath,
      line,
      column,
      rule: "no-comments",
      message: `Comments are forbidden in CSS: ${preview}`,
    });
  }
}
