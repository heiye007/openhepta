export function checkCrossBoundaryImport({
  sourceRel,
  rawSpecifier,
  targetRel,
  line,
  column,
  violations,
}) {
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
    violations.push({
      file: sourceRel,
      line,
      column,
      rule: "no-legacy-src-import",
      message: `Importing from legacy "src/" is forbidden: "${rawSpecifier}" (resolved to "${targetRel}")`,
    });
  }

  if (sourceRel.startsWith("electron-renderer/") && mentionsMain) {
    violations.push({
      file: sourceRel,
      line,
      column,
      rule: "renderer-main-isolation",
      message: `electron-renderer must never import from electron-main: "${rawSpecifier}"`,
    });
  }

  if (sourceRel.startsWith("electron-main/") && mentionsRenderer) {
    violations.push({
      file: sourceRel,
      line,
      column,
      rule: "main-renderer-isolation",
      message: `electron-main must never import from electron-renderer: "${rawSpecifier}"`,
    });
  }

  if (sourceRel.startsWith("shared/") && (mentionsMain || mentionsRenderer)) {
    violations.push({
      file: sourceRel,
      line,
      column,
      rule: "shared-isolation",
      message: `shared/ must never import from electron-main or electron-renderer: "${rawSpecifier}"`,
    });
  }
}
