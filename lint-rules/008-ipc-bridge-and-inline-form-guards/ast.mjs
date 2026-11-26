import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

function collectInterfaceMethods(sourceFile) {
  const ifaceMap = new Map();
  for (const stmt of sourceFile.statements) {
    if (!ts.isInterfaceDeclaration(stmt)) continue;
    const props = new Map();
    for (const member of stmt.members) {
      if (ts.isPropertySignature(member) && member.name) {
        const propName = member.name.getText(sourceFile);
        const typeName = member.type ? member.type.getText(sourceFile) : "";
        props.set(propName, typeName);
      }
    }
    ifaceMap.set(stmt.name.text, props);
  }
  return ifaceMap;
}

function collectObjectProperties(sourceFile, targetVarName) {
  const domainMap = new Map();
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === targetVarName &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      for (const prop of node.initializer.properties) {
        if (
          ts.isPropertyAssignment(prop) &&
          prop.name &&
          ts.isObjectLiteralExpression(prop.initializer)
        ) {
          const domainName = prop.name.getText(sourceFile);
          const methods = new Set();
          for (const m of prop.initializer.properties) {
            if ((ts.isPropertyAssignment(m) || ts.isMethodDeclaration(m)) && m.name) {
              methods.add(m.name.getText(sourceFile));
            }
          }
          domainMap.set(domainName, methods);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return domainMap;
}

export function checkIpcBridgeCompleteness(rootDir, violations) {
  const apiRel = "shared/api.ts";
  const bridgeRel = "electron-renderer/src/client/ipcBridge.ts";
  const preloadRel = "electron-main/preload.ts";
  const apiPath = path.join(rootDir, apiRel);
  const bridgePath = path.join(rootDir, bridgeRel);
  const preloadPath = path.join(rootDir, preloadRel);
  if (!fs.existsSync(apiPath) || !fs.existsSync(bridgePath)) return;

  const apiSource = ts.createSourceFile(
    apiRel,
    fs.readFileSync(apiPath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const bridgeSource = ts.createSourceFile(
    bridgeRel,
    fs.readFileSync(bridgePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  const ifaces = collectInterfaceMethods(apiSource);
  const rootApi = ifaces.get("HeptaElectronApi");
  if (!rootApi) return;

  const targets = [
    { rel: bridgeRel, domains: collectObjectProperties(bridgeSource, "heptaClient"), label: "ipcBridge" },
  ];

  if (fs.existsSync(preloadPath)) {
    const preloadSource = ts.createSourceFile(
      preloadRel,
      fs.readFileSync(preloadPath, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    targets.push({
      rel: preloadRel,
      domains: collectObjectProperties(preloadSource, "api"),
      label: "preload",
    });
  }

  for (const target of targets) {
    for (const [domain, domainType] of rootApi.entries()) {
      const domainIface = ifaces.get(domainType);
      if (!domainIface) continue;
      const implMethods = target.domains.get(domain);
      if (!implMethods) {
        violations.push({
          file: target.rel,
          line: 1,
          column: 1,
          rule: "ipc-bridge-completeness",
          message: `${target.label} 缺少 HeptaElectronApi 中定义的领域对象 "${domain}" (${domainType})。`,
        });
        continue;
      }
      for (const methodName of domainIface.keys()) {
        if (!implMethods.has(methodName)) {
          violations.push({
            file: target.rel,
            line: 1,
            column: 1,
            rule: "ipc-bridge-completeness",
            message: `${target.label}.${domain} 缺少 ${domainType}.${methodName} 的转发实现（会导致渲染层调用时出现 is not a function）。`,
          });
        }
      }
    }
  }
}
