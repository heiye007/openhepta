import type { BrowserWindow } from 'electron';
import { CliResponse, dispatchCliCommand, getUiState, str } from './cliHelpers';

const VALID_VIEWS = new Set([
  'whiteboard',
  'map',
  'cards',
  'inbox',
  'journal',
  'tags',
  'highlights',
  'chat',
  'status',
]);

export async function handleNavCli(
  win: BrowserWindow,
  action: string,
  params: Record<string, unknown>
): Promise<CliResponse> {
  if (action === 'go') {
    const view = str(params.view);
    if (!VALID_VIEWS.has(view)) {
      return {
        status: 400,
        body: {
          ok: false,
          error: `Invalid view "${view}". Valid: ${Array.from(VALID_VIEWS).join(', ')}`,
        },
      };
    }
    await dispatchCliCommand(win, { type: 'navigate', view });
    return { status: 200, body: { ok: true, domain: 'nav', action, view } };
  }
  if (action === 'toggle-sidebar') {
    const collapsed = typeof params.collapsed === 'boolean' ? params.collapsed : undefined;
    await dispatchCliCommand(win, { type: 'toggle-sidebar', collapsed });
    return { status: 200, body: { ok: true, domain: 'nav', action } };
  }
  if (action === 'open-whiteboard') {
    const id = str(params.id);
    if (!id) return { status: 400, body: { ok: false, error: 'Missing --id' } };
    await dispatchCliCommand(win, { type: 'open-whiteboard', whiteboardId: id });
    return { status: 200, body: { ok: true, domain: 'nav', action, whiteboardId: id } };
  }
  if (action === 'state') {
    const state = await getUiState(win);
    return { status: 200, body: { ok: true, domain: 'nav', action, ...state } };
  }
  return { status: 400, body: { ok: false, error: `Unsupported nav action: ${action}` } };
}
