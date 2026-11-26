import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/api';
import { SystemDiagnosticsState } from '../../shared/types';
import { getCliServerStatus } from '../cli/cliServer';
import {
  listRecentNotifications,
  sendAppNotification,
} from '../notifications/notificationService';
import {
  applyNativeTheme,
  createWindow,
  themeSourceSchema,
} from '../startup/windowManager';
import { checkForAppUpdates, getUpdateState } from '../update/updateService';

function buildDiagnosticsState(): SystemDiagnosticsState {
  return {
    isEnabled: true,
    uptime: process.uptime(),
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron ?? '',
    nodeVersion: process.versions.node ?? '',
  };
}

export function registerSystemApiHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATIONS_SEND,
    async (_event, payload: { title: string; body: string }) => {
      return sendAppNotification({
        title: payload.title || 'OpenHepta',
        body: payload.body || '',
      });
    }
  );

  ipcMain.handle(IPC_CHANNELS.NOTIFICATIONS_LIST_RECENT, async () => {
    return listRecentNotifications();
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_GET_STATE, async () => {
    return getUpdateState();
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, async () => {
    return checkForAppUpdates();
  });

  ipcMain.handle(IPC_CHANNELS.SYSTEM_GET_CLI_STATUS, async () => {
    return getCliServerStatus();
  });

  ipcMain.handle('cli:get-status', async () => {
    return getCliServerStatus();
  });

  ipcMain.handle(IPC_CHANNELS.SYSTEM_GET_DIAGNOSTICS, async () => {
    return buildDiagnosticsState();
  });

  ipcMain.handle('diagnostics:get-state', async () => {
    return buildDiagnosticsState();
  });

  const handleSetNativeTheme = (_event: Electron.IpcMainEvent, source: unknown) => {
    const parsed = themeSourceSchema.safeParse(source);
    if (!parsed.success) {
      console.warn('[OpenHepta] Ignored invalid set-native-theme payload:', source);
      return;
    }
    applyNativeTheme(parsed.data);
  };

  ipcMain.on(IPC_CHANNELS.SYSTEM_SET_NATIVE_THEME, handleSetNativeTheme);
  ipcMain.on('set-native-theme', handleSetNativeTheme);

  const handleCreateWindow = () => {
    void createWindow();
  };

  ipcMain.on(IPC_CHANNELS.SYSTEM_CREATE_WINDOW, handleCreateWindow);
  ipcMain.on('create-window', handleCreateWindow);
}
