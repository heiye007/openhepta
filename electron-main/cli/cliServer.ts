import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { BrowserWindow } from 'electron';
import { getMainWindow } from '../startup/windowManager';
import { handleMindmapAction, handleMindmapList } from './mindmapCliHandler';
import { handleFeatureCliAction } from './featureCliRouter';

const DEFAULT_CLI_PORT = 48921;
const ACCESSIBLE_SELECTOR =
  'button, a[href], input, textarea, select, [role="button"], [role="menuitem"], [role="tab"], [role="checkbox"], [role="switch"], [role="slider"], [role="radio"], [aria-label]';

let server: http.Server | null = null;
let activePort = Number(process.env.OPENHEPTA_CLI_PORT || DEFAULT_CLI_PORT);
let isRunning = false;

function getTargetWindow(): BrowserWindow | null {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) {
    return focused;
  }
  const mainWin = getMainWindow();
  if (mainWin && !mainWin.isDestroyed()) {
    return mainWin;
  }
  const all = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
  return all.length > 0 ? all[0] : null;
}

function sendJson(res: http.ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function buildSnapshotScript(): string {
  return `(() => {
    const selector = ${JSON.stringify(ACCESSIBLE_SELECTOR)};
    const nodes = Array.from(document.querySelectorAll(selector));
    const elements = [];
    for (const el of nodes) {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const style = window.getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') continue;
      const ariaLabel = el.getAttribute('aria-label') || '';
      const titleAttr = el.getAttribute('title') || '';
      const placeholder = el.getAttribute('placeholder') || '';
      const alt = el.getAttribute('alt') || '';
      const text = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
      const name = (ariaLabel || text || titleAttr || placeholder || alt).trim();
      if (!name) continue;
      const tag = el.tagName.toLowerCase();
      const inputType = tag === 'input' ? (el.getAttribute('type') || 'text').toLowerCase() : '';
      const role = el.getAttribute('role') || (tag === 'a' ? 'link' : tag === 'input' ? (inputType === 'range' ? 'slider' : inputType === 'checkbox' ? 'checkbox' : inputType === 'radio' ? 'radio' : 'textbox') : tag === 'textarea' ? 'textbox' : tag === 'select' ? 'combobox' : tag === 'button' ? 'button' : 'generic');
      const ariaChecked = el.getAttribute('aria-checked');
      const checked = ariaChecked === 'true' ? true : ariaChecked === 'false' ? false : (inputType === 'checkbox' || inputType === 'radio') ? Boolean(el.checked) : undefined;
      const value = (role === 'slider' || tag === 'input' || tag === 'textarea' || tag === 'select') && inputType !== 'checkbox' && inputType !== 'radio' ? String(el.value ?? el.getAttribute('aria-valuenow') ?? '') : undefined;
      elements.push({
        role,
        name: name.slice(0, 160),
        tag,
        disabled: Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true'),
        ...(checked !== undefined ? { checked } : {}),
        ...(value !== undefined && value !== '' ? { value } : {}),
        rect: {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      });
    }
    return {
      title: document.title,
      url: window.location.href,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      activeTextPreview: (document.body.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 300),
      elements,
    };
  })()`;
}

function buildFindAndScrollScript(
  accessibleName: string,
  role?: string,
  exact?: boolean,
  index?: number
): string {
  const argsJson = JSON.stringify({
    accessibleName,
    role: role || '',
    exact: Boolean(exact),
    index: typeof index === 'number' && index >= 0 ? index : 0,
  });
  return `(() => {
    const args = ${argsJson};
    const targetLower = args.accessibleName.trim().toLowerCase();
    const roleLower = args.role.trim().toLowerCase();
    const selector = ${JSON.stringify(ACCESSIBLE_SELECTOR)};
    const nodes = Array.from(document.querySelectorAll(selector));
    const matches = [];
    for (const el of nodes) {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const style = window.getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') continue;
      const tag = el.tagName.toLowerCase();
      const inputType = tag === 'input' ? (el.getAttribute('type') || 'text').toLowerCase() : '';
      const elRole = (el.getAttribute('role') || (tag === 'a' ? 'link' : tag === 'input' ? (inputType === 'range' ? 'slider' : inputType === 'checkbox' ? 'checkbox' : inputType === 'radio' ? 'radio' : 'textbox') : tag === 'textarea' ? 'textbox' : tag === 'select' ? 'combobox' : tag === 'button' ? 'button' : 'generic')).toLowerCase();
      if (roleLower && elRole !== roleLower) continue;
      const candidates = [
        el.getAttribute('aria-label') || '',
        el.getAttribute('title') || '',
        (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim(),
        el.getAttribute('placeholder') || '',
        el.getAttribute('alt') || '',
      ].map((s) => s.trim()).filter(Boolean);
      const matched = candidates.some((c) => {
        const cl = c.toLowerCase();
        return args.exact ? cl === targetLower : cl === targetLower || cl.includes(targetLower);
      });
      if (matched) {
        matches.push({ el, name: candidates[0] || '', role: elRole, tag });
      }
    }
    if (matches.length === 0) {
      return { found: false, matchCount: 0 };
    }
    const chosen = matches[Math.min(args.index, matches.length - 1)];
    const preRect = chosen.el.getBoundingClientRect();
    const inViewport =
      preRect.top >= 0 &&
      preRect.left >= 0 &&
      preRect.bottom <= window.innerHeight &&
      preRect.right <= window.innerWidth;
    if (!inViewport) {
      chosen.el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    }
    const rect = chosen.el.getBoundingClientRect();
    return {
      found: true,
      matchCount: matches.length,
      name: chosen.name,
      role: chosen.role,
      tag: chosen.tag,
      cx: Math.round(rect.left + rect.width / 2),
      cy: Math.round(rect.top + rect.height / 2),
      rect: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
  })()`;
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const url = new URL(req.url || '/', `http://127.0.0.1:${activePort}`);
  const method = req.method || 'GET';

  if (method === 'GET' && url.pathname === '/health') {
    const win = getTargetWindow();
    sendJson(res, 200, {
      ok: true,
      pid: process.pid,
      port: activePort,
      windowCount: BrowserWindow.getAllWindows().length,
      hasWindow: Boolean(win),
      title: win ? win.getTitle() : '',
    });
    return;
  }

  const win = getTargetWindow();
  if (!win) {
    sendJson(res, 503, { ok: false, error: 'No active OpenHepta window available.' });
    return;
  }

  if (method === 'GET' && url.pathname === '/snapshot') {
    const snapshot = await win.webContents.executeJavaScript(buildSnapshotScript(), true);
    sendJson(res, 200, { ok: true, ...snapshot });
    return;
  }

  if (method === 'POST' && url.pathname === '/aria-click') {
    const body = await readJsonBody(req);
    const accessibleName =
      typeof body.accessibleName === 'string' ? body.accessibleName : '';
    if (!accessibleName.trim()) {
      sendJson(res, 400, { ok: false, error: 'accessibleName is required.' });
      return;
    }
    const role = typeof body.role === 'string' ? body.role : undefined;
    const exact = Boolean(body.exact);
    const index = typeof body.index === 'number' ? body.index : 0;

    const match = (await win.webContents.executeJavaScript(
      buildFindAndScrollScript(accessibleName, role, exact, index),
      true
    )) as {
      found: boolean;
      matchCount: number;
      name?: string;
      role?: string;
      tag?: string;
      cx?: number;
      cy?: number;
      rect?: { x: number; y: number; width: number; height: number };
    };

    if (!match.found || typeof match.cx !== 'number' || typeof match.cy !== 'number') {
      sendJson(res, 404, {
        ok: false,
        error: `No visible element matching accessible-name "${accessibleName}"`,
      });
      return;
    }

    win.focus();
    win.webContents.focus();
    win.webContents.sendInputEvent({
      type: 'mouseMove',
      x: match.cx,
      y: match.cy,
    });
    win.webContents.sendInputEvent({
      type: 'mouseDown',
      x: match.cx,
      y: match.cy,
      button: 'left',
      clickCount: 1,
    });
    win.webContents.sendInputEvent({
      type: 'mouseUp',
      x: match.cx,
      y: match.cy,
      button: 'left',
      clickCount: 1,
    });

    await new Promise((r) => setTimeout(r, 120));
    sendJson(res, 200, {
      ok: true,
      clicked: {
        name: match.name,
        role: match.role,
        tag: match.tag,
        cx: match.cx,
        cy: match.cy,
        matchCount: match.matchCount,
      },
    });
    return;
  }

  if (method === 'POST' && url.pathname === '/aria-drag') {
    const body = await readJsonBody(req);
    const accessibleName =
      typeof body.accessibleName === 'string' ? body.accessibleName : '';
    if (!accessibleName.trim()) {
      sendJson(res, 400, { ok: false, error: 'accessibleName is required.' });
      return;
    }
    const role = typeof body.role === 'string' ? body.role : undefined;
    const exact = Boolean(body.exact);
    const index = typeof body.index === 'number' ? body.index : 0;
    const dx = typeof body.dx === 'number' ? body.dx : 0;
    const dy = typeof body.dy === 'number' ? body.dy : 0;
    const steps = 6;

    const match = (await win.webContents.executeJavaScript(
      buildFindAndScrollScript(accessibleName, role, exact, index),
      true
    )) as {
      found: boolean;
      matchCount: number;
      name?: string;
      role?: string;
      tag?: string;
      cx?: number;
      cy?: number;
    };

    if (!match.found || typeof match.cx !== 'number' || typeof match.cy !== 'number') {
      sendJson(res, 404, {
        ok: false,
        error: `No visible element matching accessible-name "${accessibleName}"`,
      });
      return;
    }

    const startX = match.cx;
    const startY = match.cy;
    const endX = Math.round(startX + dx);
    const endY = Math.round(startY + dy);

    win.focus();
    win.webContents.focus();
    win.webContents.sendInputEvent({ type: 'mouseMove', x: startX, y: startY });
    win.webContents.sendInputEvent({
      type: 'mouseDown',
      x: startX,
      y: startY,
      button: 'left',
      clickCount: 1,
    });
    for (let s = 1; s <= steps; s++) {
      await new Promise((r) => setTimeout(r, 20));
      win.webContents.sendInputEvent({
        type: 'mouseMove',
        x: Math.round(startX + (dx * s) / steps),
        y: Math.round(startY + (dy * s) / steps),
        modifiers: ['leftButtonDown'],
      });
    }
    await new Promise((r) => setTimeout(r, 20));
    win.webContents.sendInputEvent({
      type: 'mouseUp',
      x: endX,
      y: endY,
      button: 'left',
      clickCount: 1,
    });

    await new Promise((r) => setTimeout(r, 200));
    sendJson(res, 200, {
      ok: true,
      dragged: {
        name: match.name,
        from: { x: startX, y: startY },
        to: { x: endX, y: endY },
        dx,
        dy,
      },
    });
    return;
  }

  if (method === 'POST' && url.pathname === '/aria-type') {
    const body = await readJsonBody(req);
    const text = typeof body.text === 'string' ? body.text : '';
    const accessibleName =
      typeof body.accessibleName === 'string' ? body.accessibleName : '';
    if (accessibleName.trim()) {
      const match = (await win.webContents.executeJavaScript(
        buildFindAndScrollScript(accessibleName, undefined, false, 0),
        true
      )) as { found: boolean; cx?: number; cy?: number };
      if (!match.found || typeof match.cx !== 'number' || typeof match.cy !== 'number') {
        sendJson(res, 404, {
          ok: false,
          error: `No visible element matching accessible-name "${accessibleName}"`,
        });
        return;
      }
      win.webContents.sendInputEvent({ type: 'mouseDown', x: match.cx, y: match.cy, button: 'left', clickCount: 1 });
      win.webContents.sendInputEvent({ type: 'mouseUp', x: match.cx, y: match.cy, button: 'left', clickCount: 1 });
      await new Promise((r) => setTimeout(r, 60));
    }
    if (text) {
      await win.webContents.insertText(text);
    }
    sendJson(res, 200, { ok: true, typedLength: text.length });
    return;
  }

  if (method === 'POST' && url.pathname === '/aria-set-value') {
    const body = await readJsonBody(req);
    const accessibleName =
      typeof body.accessibleName === 'string' ? body.accessibleName : '';
    const value = body.value !== undefined && body.value !== null ? String(body.value) : '';
    if (!accessibleName.trim()) {
      sendJson(res, 400, { ok: false, error: 'accessibleName is required.' });
      return;
    }
    const role = typeof body.role === 'string' ? body.role : undefined;
    const exact = Boolean(body.exact);
    const index = typeof body.index === 'number' ? body.index : 0;
    const argsJson = JSON.stringify({
      accessibleName,
      role: role || '',
      exact,
      index,
      value,
      selector: ACCESSIBLE_SELECTOR,
    });
    const result = (await win.webContents.executeJavaScript(
      `(() => {
        const args = ${argsJson};
        const targetLower = args.accessibleName.trim().toLowerCase();
        const roleLower = args.role.trim().toLowerCase();
        const nodes = Array.from(document.querySelectorAll(args.selector));
        const matches = [];
        for (const el of nodes) {
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          const tag = el.tagName.toLowerCase();
          const inputType = tag === 'input' ? (el.getAttribute('type') || 'text').toLowerCase() : '';
          const elRole = (el.getAttribute('role') || (tag === 'input' && inputType === 'range' ? 'slider' : tag === 'select' ? 'combobox' : 'textbox')).toLowerCase();
          if (roleLower && elRole !== roleLower) continue;
          const candidates = [
            el.getAttribute('aria-label') || '',
            el.getAttribute('title') || '',
            el.getAttribute('placeholder') || '',
          ].map((s) => s.trim()).filter(Boolean);
          const matched = candidates.some((c) => {
            const cl = c.toLowerCase();
            return args.exact ? cl === targetLower : cl === targetLower || cl.includes(targetLower);
          });
          if (matched) matches.push({ el, name: candidates[0] || '', role: elRole });
        }
        if (matches.length === 0) return { found: false };
        const chosen = matches[Math.min(Math.max(0, args.index), matches.length - 1)];
        const el = chosen.el;
        el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
        const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (descriptor && descriptor.set) {
          descriptor.set.call(el, args.value);
        } else {
          el.value = args.value;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { found: true, name: chosen.name, role: chosen.role, value: String(el.value) };
      })()`,
      true
    )) as { found: boolean; name?: string; role?: string; value?: string };

    if (!result.found) {
      sendJson(res, 404, {
        ok: false,
        error: `No visible element matching accessible-name "${accessibleName}"`,
      });
      return;
    }
    sendJson(res, 200, { ok: true, updated: result });
    return;
  }

  if (method === 'POST' && url.pathname === '/screenshot') {
    const body = await readJsonBody(req);
    const outPath = typeof body.outPath === 'string' ? body.outPath.trim() : '';
    const image = await win.webContents.capturePage();
    const png = image.toPNG();
    const size = image.getSize();
    if (outPath) {
      const resolved = path.resolve(outPath);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, png);
      sendJson(res, 200, {
        ok: true,
        path: resolved,
        bytes: png.length,
        width: size.width,
        height: size.height,
      });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      base64: png.toString('base64'),
      bytes: png.length,
      width: size.width,
      height: size.height,
    });
    return;
  }

  if (method === 'GET' && url.pathname === '/mindmap/list') {
    const result = await handleMindmapList(win);
    sendJson(res, result.status, result.body);
    return;
  }

  if (method === 'POST' && url.pathname === '/mindmap/action') {
    const body = await readJsonBody(req);
    const result = await handleMindmapAction(win, body);
    sendJson(res, result.status, result.body);
    return;
  }

  if (method === 'POST' && url.pathname.startsWith('/feature/')) {
    const domain = url.pathname.slice('/feature/'.length).trim();
    const body = await readJsonBody(req);
    const action = typeof body.action === 'string' ? body.action.trim() : '';
    const params =
      body.params && typeof body.params === 'object'
        ? (body.params as Record<string, unknown>)
        : {};
    const result = await handleFeatureCliAction(win, domain, action, params);
    sendJson(res, result.status, result.body);
    return;
  }

  sendJson(res, 404, { ok: false, error: `Unknown endpoint: ${method} ${url.pathname}` });
}

export function getCliServerStatus(): { isRunning: boolean; port: number } {
  return { isRunning, port: activePort };
}

export function startCliServer(): void {
  if (server) {
    return;
  }
  const desiredPort = Number(process.env.OPENHEPTA_CLI_PORT || DEFAULT_CLI_PORT);
  activePort = Number.isFinite(desiredPort) && desiredPort > 0 ? desiredPort : DEFAULT_CLI_PORT;

  const instance = http.createServer((req, res) => {
    void handleRequest(req, res).catch((err) => {
      sendJson(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  });

  instance.on('error', (err: NodeJS.ErrnoException) => {
    console.warn(`[OpenHepta CLI Server] Port ${activePort} unavailable (${err.code || err.message})`);
    isRunning = false;
  });

  instance.listen(activePort, '127.0.0.1', () => {
    isRunning = true;
    console.log(`[OpenHepta CLI Server] Listening on http://127.0.0.1:${activePort}`);
  });

  server = instance;
}

export function stopCliServer(): void {
  if (!server) {
    return;
  }
  server.close();
  server = null;
  isRunning = false;
}
