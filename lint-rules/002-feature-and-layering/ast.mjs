import { getFeatureName } from "../shared/pathUtils.mjs";

export function checkFeatureAndLayeringImport({
  sourceRel,
  rawSpecifier,
  targetRel,
  line,
  column,
  violations,
}) {
  if (!targetRel) {
    return;
  }

  const sourceFeature = getFeatureName(sourceRel);
  const targetFeature = getFeatureName(targetRel);

  if (sourceFeature) {
    if (targetFeature && targetFeature !== sourceFeature) {
      violations.push({
        file: sourceRel,
        line,
        column,
        rule: "cross-feature-import",
        message: `Feature "${sourceFeature}" must never import from another feature "${targetFeature}": "${rawSpecifier}"`,
      });
    } else if (targetRel === "electron-renderer/src/features") {
      violations.push({
        file: sourceRel,
        line,
        column,
        rule: "cross-feature-import",
        message: `Feature "${sourceFeature}" must never import from the features root barrel: "${rawSpecifier}"`,
      });
    }
  }

  if (sourceRel.startsWith("electron-renderer/src/primitives/")) {
    if (
      targetRel === "electron-renderer/src/features" ||
      targetRel.startsWith("electron-renderer/src/features/")
    ) {
      violations.push({
        file: sourceRel,
        line,
        column,
        rule: "primitives-layering",
        message: `electron-renderer/src/primitives/ must never import from features/: "${rawSpecifier}"`,
      });
    }
    if (
      targetRel === "electron-renderer/src/client" ||
      targetRel.startsWith("electron-renderer/src/client/")
    ) {
      violations.push({
        file: sourceRel,
        line,
        column,
        rule: "primitives-layering",
        message: `electron-renderer/src/primitives/ must never import from client/: "${rawSpecifier}"`,
      });
    }
  }

  if (sourceRel.startsWith("electron-renderer/src/client/")) {
    if (
      targetRel === "electron-renderer/src/features" ||
      targetRel.startsWith("electron-renderer/src/features/")
    ) {
      violations.push({
        file: sourceRel,
        line,
        column,
        rule: "client-layering",
        message: `electron-renderer/src/client/ must never import from features/: "${rawSpecifier}"`,
      });
    }
    if (
      targetRel === "electron-renderer/src/primitives" ||
      targetRel.startsWith("electron-renderer/src/primitives/")
    ) {
      violations.push({
        file: sourceRel,
        line,
        column,
        rule: "client-layering",
        message: `electron-renderer/src/client/ must never import from primitives/: "${rawSpecifier}"`,
      });
    }
  }
}
