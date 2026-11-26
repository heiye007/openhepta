import type { BrowserWindow } from 'electron';
import { CliResponse, dispatchCliCommand, getUiState, str } from './cliHelpers';

export async function handleDrawerCli(
  win: BrowserWindow,
  action: string,
  params: Record<string, unknown>
): Promise<CliResponse> {
  if (action === 'status') {
    const state = await getUiState(win);
    return { status: 200, body: { ok: true, drawerOpen: state.drawerOpen } };
  }
  if (action === 'toggle') {
    const open = typeof params.open === 'boolean' ? params.open : undefined;
    await dispatchCliCommand(win, { type: 'toggle-drawer', open });
    const state = await getUiState(win);
    return { status: 200, body: { ok: true, drawerOpen: state.drawerOpen } };
  }
  if (action === 'open-card') {
    const id = str(params.id);
    if (!id) return { status: 400, body: { ok: false, error: 'Missing --id' } };
    await dispatchCliCommand(win, { type: 'open-card', cardId: id, full: false });
    return { status: 200, body: { ok: true, cardId: id, drawerOpen: true } };
  }
  return { status: 400, body: { ok: false, error: `Unsupported drawer action: ${action}` } };
}
