import type { BrowserWindow } from 'electron';
import { applyNativeTheme, readSavedTheme, saveTheme } from '../startup/windowManager';
import { listRecentNotifications, sendAppNotification } from '../notifications/notificationService';
import { getUpdateState } from '../update/updateService';
import { CliResponse, dispatchCliCommand, getUiState, str } from './cliHelpers';

export async function handleSystemCli(
  win: BrowserWindow,
  action: string,
  params: Record<string, unknown>
): Promise<CliResponse> {
  if (action === 'status') {
    const ui = await getUiState(win);
    const update = getUpdateState();
    const notifications = listRecentNotifications();
    const savedTheme = readSavedTheme();
    return {
      status: 200,
      body: {
        ok: true,
        ui,
        savedTheme,
        update,
        notificationCount: notifications.length,
      },
    };
  }
  if (action === 'theme') {
    const mode = str(params.mode);
    if (mode !== 'light' && mode !== 'dark') {
      return { status: 400, body: { ok: false, error: 'Invalid --mode (light|dark)' } };
    }
    saveTheme(mode);
    applyNativeTheme(mode);
    await dispatchCliCommand(win, { type: 'set-theme', mode });
    return { status: 200, body: { ok: true, action, mode } };
  }
  if (action === 'notify') {
    const title = str(params.title) || 'OpenHepta CLI';
    const bodyText = str(params.body) || 'Notification from CLI';
    const record = sendAppNotification({ title, body: bodyText });
    return { status: 200, body: { ok: true, action, notification: record } };
  }
  return { status: 400, body: { ok: false, error: `Unsupported system action: ${action}` } };
}
