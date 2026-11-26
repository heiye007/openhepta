#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = Number(process.env.OPENHEPTA_CLI_PORT || 48921);

function requestJson(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body !== null ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: endpoint,
        method,
        headers: payload
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
            }
          : {},
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          try {
            const parsed = JSON.parse(text);
            resolve({ status: res.statusCode || 500, data: parsed });
          } catch {
            resolve({ status: res.statusCode || 500, data: { ok: false, raw: text } });
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        flags[arg.slice(2)] = args[++i];
      } else {
        flags[arg.slice(2)] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

function printUsage() {
  console.log(`OpenHepta Live App CLI (port ${PORT})

Usage:
  app status
  app launch
  app aria-click --accessible-name <name> [--role <role>] [--exact] [--index <n>]
  app aria-drag --accessible-name <name> --dx <px> --dy <px> [--role <role>] [--exact] [--index <n>]
  app aria-type [--accessible-name <name>] --text <text>
  app aria-set-value --accessible-name <name> --value <value> [--role <role>] [--exact] [--index <n>]
  app snapshot [--json] [--filter <text>] [--role <role>]
  app screenshot <output.png>
  app mindmap list [--json]
  app mindmap create [--title <text>] [--layout horizontal|vertical] [--x <n>] [--y <n>]
  app mindmap add-node [--mindmap-id <id>] [--parent-id <id>] --text <text> [--side left|right] [--color <color>] [--type textNode|cardNode|highlightElementNode] [--card-id <id>] [--highlight-id <id>]
  app mindmap edit-node [--mindmap-id <id>] --node-id <id> --text <text>
  app mindmap move-node [--mindmap-id <id>] --node-id <id> --parent-id <id> [--side left|right]
  app mindmap delete-node [--mindmap-id <id>] --node-id <id>
  app mindmap collapse [--mindmap-id <id>] --node-id <id>
  app mindmap expand [--mindmap-id <id>] --node-id <id>
  app mindmap set-color [--mindmap-id <id>] --node-id <id> --color <color>
  app mindmap set-layout [--mindmap-id <id>] --layout horizontal|vertical
  app mindmap select-node [--mindmap-id <id>] [--node-id <id>]
  app mindmap delete [--mindmap-id <id>]
  app nav <go|toggle-sidebar|open-whiteboard|state> [options]
  app whiteboard <list|create|rename|delete|open|objects|add-card|add-section|add-subwhiteboard|connect|delete-object|options> [options]
  app card <list|create|update|delete|open|backlinks> [options]
  app drawer <status|toggle|open-card> [options]
  app document <list|open|delete> [options]
  app highlight <list|create|update|delete|add-to-whiteboard> [options]
  app inbox <list|capture> [options]
  app journal <list|today|open> [options]
  app tag <list|create|delete|attach|detach|cards> [options]
  app search <query|open|close> [options]
  app system <status|theme|notify> [options]
  app upload <file|list> [options]`);
}

async function cmdLaunch() {
  const electronBin = path.join(
    ROOT_DIR,
    'node_modules',
    'electron',
    'dist',
    process.platform === 'win32' ? 'electron.exe' : 'electron'
  );
  if (!fs.existsSync(electronBin)) {
    console.error(`Electron binary not found at ${electronBin}`);
    process.exit(1);
  }
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electronBin, ['.'], {
    cwd: ROOT_DIR,
    env,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const res = await requestJson('GET', '/health');
      if (res.status === 200 && res.data.ok && res.data.hasWindow) {
        console.log(JSON.stringify(res.data, null, 2));
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  console.error(`Timed out waiting for OpenHepta CLI server on 127.0.0.1:${PORT}`);
  process.exit(1);
}

async function main() {
  const [, , command, ...rest] = process.argv;
  if (!command || command === '--help' || command === '-h') {
    printUsage();
    return;
  }

  if (command === 'launch') {
    await cmdLaunch();
    return;
  }

  try {
    if (command === 'status') {
      const res = await requestJson('GET', '/health');
      console.log(JSON.stringify(res.data, null, 2));
      process.exit(res.data.ok ? 0 : 1);
    }

    if (command === 'aria-click') {
      const { flags, positional } = parseFlags(rest);
      const accessibleName = String(
        flags['accessible-name'] ?? flags.name ?? positional[0] ?? ''
      ).trim();
      if (!accessibleName) {
        console.error('Missing --accessible-name "<name>"');
        process.exit(1);
      }
      const res = await requestJson('POST', '/aria-click', {
        accessibleName,
        role: typeof flags.role === 'string' ? flags.role : undefined,
        exact: Boolean(flags.exact),
        index: typeof flags.index === 'string' ? Number(flags.index) : 0,
      });
      console.log(JSON.stringify(res.data, null, 2));
      process.exit(res.status >= 200 && res.status < 300 ? 0 : 1);
    }

    if (command === 'aria-drag') {
      const { flags, positional } = parseFlags(rest);
      const accessibleName = String(
        flags['accessible-name'] ?? flags.name ?? positional[0] ?? ''
      ).trim();
      if (!accessibleName) {
        console.error('Missing --accessible-name "<name>"');
        process.exit(1);
      }
      const res = await requestJson('POST', '/aria-drag', {
        accessibleName,
        role: typeof flags.role === 'string' ? flags.role : undefined,
        exact: Boolean(flags.exact),
        index: typeof flags.index === 'string' ? Number(flags.index) : 0,
        dx: typeof flags.dx === 'string' ? Number(flags.dx) : 0,
        dy: typeof flags.dy === 'string' ? Number(flags.dy) : 0,
      });
      console.log(JSON.stringify(res.data, null, 2));
      process.exit(res.status >= 200 && res.status < 300 ? 0 : 1);
    }

    if (command === 'aria-type') {
      const { flags } = parseFlags(rest);
      const text = typeof flags.text === 'string' ? flags.text : '';
      const accessibleName =
        typeof flags['accessible-name'] === 'string' ? flags['accessible-name'] : '';
      const res = await requestJson('POST', '/aria-type', { accessibleName, text });
      console.log(JSON.stringify(res.data, null, 2));
      process.exit(res.status >= 200 && res.status < 300 ? 0 : 1);
    }

    if (command === 'aria-set-value') {
      const { flags, positional } = parseFlags(rest);
      const accessibleName = String(
        flags['accessible-name'] ?? flags.name ?? positional[0] ?? ''
      ).trim();
      const value = flags.value ?? positional[1];
      if (!accessibleName || value === undefined || value === true) {
        console.error('Missing --accessible-name "<name>" and --value "<val>"');
        process.exit(1);
      }
      const res = await requestJson('POST', '/aria-set-value', {
        accessibleName,
        value: String(value),
        role: typeof flags.role === 'string' ? flags.role : undefined,
        exact: Boolean(flags.exact),
        index: typeof flags.index === 'string' ? Number(flags.index) : 0,
      });
      console.log(JSON.stringify(res.data, null, 2));
      process.exit(res.status >= 200 && res.status < 300 ? 0 : 1);
    }

    if (command === 'snapshot') {
      const { flags } = parseFlags(rest);
      const res = await requestJson('GET', '/snapshot');
      if (res.status !== 200 || !res.data.ok) {
        console.error(JSON.stringify(res.data, null, 2));
        process.exit(1);
      }
      const filterText =
        typeof flags.filter === 'string' ? flags.filter.toLowerCase() : '';
      const roleFilter =
        typeof flags.role === 'string' ? flags.role.toLowerCase() : '';
      const elements = (res.data.elements || []).filter((el) => {
        if (roleFilter && el.role.toLowerCase() !== roleFilter) return false;
        if (filterText && !el.name.toLowerCase().includes(filterText)) return false;
        return true;
      });
      if (flags.json) {
        console.log(JSON.stringify({ ...res.data, elements }, null, 2));
      } else {
        console.log(
          `Title: ${res.data.title} (${res.data.viewport?.width}x${res.data.viewport?.height})`
        );
        console.log(`Visible accessible elements (${elements.length}):`);
        for (const el of elements) {
          const stateParts = [];
          if (typeof el.checked === 'boolean') stateParts.push(`checked=${el.checked}`);
          if (el.value !== undefined) stateParts.push(`value=${el.value}`);
          const stateSuffix = stateParts.length > 0 ? ` [${stateParts.join(', ')}]` : '';
          console.log(
            `  - [${el.role}] "${el.name}"${stateSuffix} (${el.rect.x},${el.rect.y} ${el.rect.width}x${el.rect.height})`
          );
        }
      }
      return;
    }

    if (command === 'screenshot') {
      const { flags, positional } = parseFlags(rest);
      const targetFile = String(flags.out ?? positional[0] ?? 'proof.png');
      const outPath = path.resolve(process.cwd(), targetFile);
      const res = await requestJson('POST', '/screenshot', { outPath });
      console.log(JSON.stringify(res.data, null, 2));
      process.exit(res.status >= 200 && res.status < 300 ? 0 : 1);
    }

    if (command === 'mindmap') {
      const [subcommand, ...subRest] = rest;
      const { flags } = parseFlags(subRest);
      if (!subcommand || subcommand === '--help' || subcommand === '-h') {
        printUsage();
        return;
      }
      if (subcommand === 'list') {
        const res = await requestJson('GET', '/mindmap/list');
        if (flags.json || res.status !== 200 || !res.data.ok) {
          console.log(JSON.stringify(res.data, null, 2));
          process.exit(res.status >= 200 && res.status < 300 ? 0 : 1);
        }
        console.log(`Whiteboard: ${res.data.whiteboardId} (${res.data.count} mindmap(s))`);
        for (const mm of res.data.mindmaps || []) {
          console.log(`  - ${mm.objectId} [layout=${mm.layout}, nodes=${mm.nodeCount}]`);
          for (const n of mm.nodes || []) {
            const meta = [n.type, n.side || 'root', n.edgeColor, n.isCollapsed ? 'collapsed' : 'open'].join(', ');
            console.log(`      • ${n.id} (parent=${n.parentId || 'null'}): "${n.content}" [${meta}]`);
          }
        }
        return;
      }
      const res = await requestJson('POST', '/mindmap/action', {
        action: subcommand,
        mindmapId: typeof flags['mindmap-id'] === 'string' ? flags['mindmap-id'] : undefined,
        parentId: typeof flags['parent-id'] === 'string' ? flags['parent-id'] : undefined,
        nodeId: typeof flags['node-id'] === 'string' ? flags['node-id'] : undefined,
        text: typeof flags.text === 'string' ? flags.text : undefined,
        title: typeof flags.title === 'string' ? flags.title : undefined,
        side: typeof flags.side === 'string' ? flags.side : undefined,
        color: typeof flags.color === 'string' ? flags.color : undefined,
        layout: typeof flags.layout === 'string' ? flags.layout : undefined,
        nodeType: typeof flags.type === 'string' ? flags.type : undefined,
        cardId: typeof flags['card-id'] === 'string' ? flags['card-id'] : undefined,
        highlightId: typeof flags['highlight-id'] === 'string' ? flags['highlight-id'] : undefined,
        x: typeof flags.x === 'string' ? Number(flags.x) : undefined,
        y: typeof flags.y === 'string' ? Number(flags.y) : undefined,
      });
      console.log(JSON.stringify(res.data, null, 2));
      process.exit(res.status >= 200 && res.status < 300 ? 0 : 1);
    }

    const FEATURE_DOMAINS = new Set([
      'nav',
      'whiteboard',
      'card',
      'drawer',
      'document',
      'highlight',
      'inbox',
      'journal',
      'tag',
      'search',
      'system',
      'upload',
    ]);

    if (FEATURE_DOMAINS.has(command)) {
      const [subcommand, ...subRest] = rest;
      if (!subcommand || subcommand === '--help' || subcommand === '-h') {
        printUsage();
        return;
      }
      const { flags, positional } = parseFlags(subRest);
      const params = {};
      for (const [key, val] of Object.entries(flags)) {
        const camelKey = key.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
        params[camelKey] = val;
      }
      if (command === 'nav' && subcommand === 'go' && !params.view && positional[0]) {
        params.view = positional[0];
      }
      if (command === 'system' && subcommand === 'theme' && !params.mode && positional[0]) {
        params.mode = positional[0];
      }
      if (command === 'search' && subcommand === 'query' && !params.text && positional[0]) {
        params.text = positional[0];
      }
      if (
        (subcommand === 'open' || subcommand === 'delete' || subcommand === 'open-whiteboard' || subcommand === 'open-card') &&
        !params.id &&
        positional[0]
      ) {
        params.id = positional[0];
      }
      const res = await requestJson('POST', `/feature/${command}`, {
        action: subcommand,
        params,
      });
      console.log(JSON.stringify(res.data, null, 2));
      process.exit(res.status >= 200 && res.status < 300 ? 0 : 1);
    }

    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  } catch (err) {
    console.error(
      `Failed to connect to live OpenHepta app on http://127.0.0.1:${PORT}. Is the app running? (${err.message})`
    );
    process.exit(1);
  }
}

main();
