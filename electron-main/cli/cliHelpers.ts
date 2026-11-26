import type { BrowserWindow } from 'electron';
import { dbMaster } from '../database/dbMaster';

export interface CliResponse {
  status: number;
  body: Record<string, unknown>;
}

export type FeatureCliHandler = (
  win: BrowserWindow,
  action: string,
  params: Record<string, unknown>
) => Promise<CliResponse>;

export function str(val: unknown): string {
  return typeof val === 'string' ? val.trim() : '';
}

export function num(val: unknown, fallback: number): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim() !== '') {
    const parsed = Number(val);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export async function dispatchCliCommand(
  win: BrowserWindow,
  detail: Record<string, unknown>
): Promise<void> {
  await win.webContents.executeJavaScript(
    `window.dispatchEvent(new CustomEvent('openhepta:cli-command', { detail: ${JSON.stringify(detail)} }));`,
    true
  );
  await new Promise((r) => setTimeout(r, 150));
}

export async function getActiveWhiteboardId(win: BrowserWindow): Promise<string | null> {
  const domId = (await win.webContents.executeJavaScript(
    `(() => {
      const el = document.querySelector('[data-whiteboard-id]');
      return el ? el.getAttribute('data-whiteboard-id') : null;
    })()`,
    true
  )) as string | null;
  if (domId) return domId;
  const rows = await dbMaster.query<{ id: string }>(
    `SELECT id FROM whiteboards WHERE is_deleted = 0 ORDER BY updated_at DESC LIMIT 1`
  );
  return rows[0]?.id ?? null;
}

export async function getUiState(win: BrowserWindow): Promise<{
  currentView: string | null;
  drawerOpen: boolean;
  theme: string | null;
  whiteboardId: string | null;
}> {
  return (await win.webContents.executeJavaScript(
    `(() => {
      const appEl = document.querySelector('[data-current-view]');
      const wbEl = document.querySelector('[data-whiteboard-id]');
      return {
        currentView: appEl ? appEl.getAttribute('data-current-view') : null,
        drawerOpen: appEl ? appEl.getAttribute('data-drawer-open') === 'true' : false,
        theme: appEl ? appEl.getAttribute('data-theme-mode') : null,
        whiteboardId: wbEl ? wbEl.getAttribute('data-whiteboard-id') : null,
      };
    })()`,
    true
  )) as {
    currentView: string | null;
    drawerOpen: boolean;
    theme: string | null;
    whiteboardId: string | null;
  };
}

export function buildProseMirrorDocJson(text: string): string {
  const lines = text ? text.split(/\r?\n/) : [''];
  return JSON.stringify({
    type: 'doc',
    content: lines.map((line) =>
      line
        ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
        : { type: 'paragraph' }
    ),
  });
}

export function todayDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
