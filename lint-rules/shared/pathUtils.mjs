import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const ROOT_DIR = path.resolve(__dirname, "../..");

export const RAW_SQL_PATTERN =
  /\b(SELECT\s+[\s\S]+?\s+FROM|INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE\s+[A-Za-z_][A-Za-z0-9_]*\s+SET|DELETE\s+FROM)\b/;

export const NATIVE_DIALOG_BAN_MESSAGE =
  "禁止使用原生 alert/confirm/prompt，请使用应用内自定义模态框 (useAppModal / ModalDialog)。";

export function toPosixPath(p) {
  return p.split(path.sep).join("/");
}

export function getRelativeToRoot(absPath) {
  return toPosixPath(path.relative(ROOT_DIR, absPath));
}

export function resolveImportTarget(sourceAbsPath, rawSpecifier) {
  const spec = rawSpecifier.trim();
  if (!spec) {
    return null;
  }
  if (spec === "@shared" || spec.startsWith("@shared/")) {
    const sub = spec === "@shared" ? "" : spec.slice("@shared/".length);
    return toPosixPath(path.posix.normalize(sub ? `shared/${sub}` : "shared"));
  }
  if (spec === "@" || spec.startsWith("@/")) {
    const sub = spec === "@" ? "" : spec.slice("@/".length);
    return toPosixPath(
      path.posix.normalize(
        sub ? `electron-renderer/src/${sub}` : "electron-renderer/src"
      )
    );
  }
  if (spec === "@renderer" || spec.startsWith("@renderer/")) {
    const sub = spec === "@renderer" ? "" : spec.slice("@renderer/".length);
    return toPosixPath(
      path.posix.normalize(
        sub ? `electron-renderer/src/${sub}` : "electron-renderer/src"
      )
    );
  }
  if (spec === "@main" || spec.startsWith("@main/")) {
    const sub = spec === "@main" ? "" : spec.slice("@main/".length);
    return toPosixPath(
      path.posix.normalize(sub ? `electron-main/${sub}` : "electron-main")
    );
  }
  if (spec.startsWith(".")) {
    const resolvedAbs = path.resolve(path.dirname(sourceAbsPath), spec);
    return getRelativeToRoot(resolvedAbs);
  }
  for (const prefix of [
    "electron-main",
    "electron-renderer",
    "shared",
    "src",
  ]) {
    if (spec === prefix || spec.startsWith(`${prefix}/`)) {
      return toPosixPath(path.posix.normalize(spec));
    }
  }
  return null;
}

export function getFeatureName(relPath) {
  const match = /^electron-renderer\/src\/features\/([^/]+)(\/|$)/.exec(
    relPath
  );
  return match ? match[1] : null;
}
