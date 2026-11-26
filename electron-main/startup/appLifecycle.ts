import { app, BrowserWindow } from 'electron';
import { registerAllApiHandlers } from '../api';
import { startCliServer, stopCliServer } from '../cli/cliServer';
import { setupWindowsTaskList } from './menu';
import { registerProtocols } from './protocols';
import { cleanupStorage, initStorage } from './storage';
import {
  clearMainWindow,
  createWindow,
  focusOrCreateWindow,
  initNativeThemeSync,
} from './windowManager';

const isMacOs = process.platform === 'darwin';

export function setupProcessErrorHandlers(): void {
  process.on('uncaughtException', (err) => {
    console.error('[OpenHepta] uncaughtException:', err);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[OpenHepta] unhandledRejection:', reason);
  });
}

export function bootstrapAppLifecycle(): void {
  setupProcessErrorHandlers();

  const gotSingleInstanceLock = !app.isPackaged || app.requestSingleInstanceLock();
  if (!gotSingleInstanceLock) {
    app.quit();
    return;
  }

  if (app.isPackaged) {
    app.on('second-instance', (_event, argv) => {
      if (argv.slice(1).includes('--new-window')) {
        void createWindow();
        return;
      }
      focusOrCreateWindow();
    });
  }

  app.whenReady().then(async () => {
    try {
      const userDataPath = app.getPath('userData');
      initNativeThemeSync();
      const storagePromise = initStorage(userDataPath);
      registerProtocols();
      registerAllApiHandlers();
      startCliServer();
      setupWindowsTaskList(app);
      await Promise.all([storagePromise, createWindow()]);

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          void createWindow();
        }
      });
    } catch (err) {
      console.error('[OpenHepta] Startup failure:', err);
    }
  });

  app.on('window-all-closed', () => {
    clearMainWindow();
    if (!isMacOs) {
      stopCliServer();
      cleanupStorage();
      app.quit();
    }
  });
}
