import {
  app,
  BrowserWindow,
  nativeImage,
  NativeImage,
  nativeTheme,
} from 'electron';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { z } from 'zod';
import { NativeThemeSource } from '../../shared/types';
import { buildAndSetApplicationMenuOnce } from './menu';

const isMacOs = process.platform === 'darwin';
export const themeSourceSchema = z.enum(['light', 'dark', 'system']);

export const ROOT_DIR = path.resolve(__dirname, '../../..');
const DEV_SERVER_URLS = [
  ['http', '127.0.0.1:5173'].join(':/' + '/'),
  ['http', '[::1]:5173'].join(':/' + '/'),
];

const windows = new Set<BrowserWindow>();
let mainWindow: BrowserWindow | null = null;

function getThemeConfigPath(): string {
  return path.join(app.getPath('userData'), 'theme-config.json');
}

export function readSavedTheme(): NativeThemeSource {
  try {
    const configPath = getThemeConfigPath();
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { theme?: unknown };
      const parsed = themeSourceSchema.safeParse(raw?.theme);
      if (parsed.success) {
        return parsed.data;
      }
    }
  } catch (err) {
    console.warn('[OpenHepta] Error reading saved theme:', err);
  }
  return 'light';
}

export function saveTheme(theme: NativeThemeSource): void {
  try {
    const configPath = getThemeConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ theme }, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[OpenHepta] Error saving theme:', err);
  }
}

export function getWindowBackgroundColor(): string {
  return nativeTheme.shouldUseDarkColors ? '#212121' : '#f7f7f7';
}

export function syncOpenWindowBackgrounds(): void {
  const backgroundColor = getWindowBackgroundColor();
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.setBackgroundColor(backgroundColor);
    }
  }
}

export function applyNativeTheme(theme: NativeThemeSource): void {
  nativeTheme.themeSource = theme;
  syncOpenWindowBackgrounds();
  saveTheme(theme);
}

export function initNativeThemeSync(): void {
  nativeTheme.themeSource = readSavedTheme();
  nativeTheme.on('updated', () => {
    syncOpenWindowBackgrounds();
  });
}

export function resolveAppIcon(): NativeImage | undefined {
  const iconPath = path.join(ROOT_DIR, 'assets', 'icon.png');
  if (!fs.existsSync(iconPath)) {
    console.warn(`[OpenHepta] Window icon not found at ${iconPath}`);
    return undefined;
  }
  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    console.warn(`[OpenHepta] Loaded window icon is empty at ${iconPath}`);
    return undefined;
  }
  return image;
}

export function getMainWindow(): BrowserWindow | null {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }
  const next = windows.values().next().value ?? null;
  mainWindow = next && !next.isDestroyed() ? next : null;
  return mainWindow;
}

export function clearMainWindow(): void {
  mainWindow = null;
}

export function focusOrCreateWindow(): void {
  const target = getMainWindow();
  if (target && !target.isDestroyed()) {
    if (target.isMinimized()) target.restore();
    target.focus();
  } else {
    void createWindow();
  }
}

function probeDevServer(urlString: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(urlString, (res) => {
      res.resume();
      resolve((res.statusCode ?? 500) < 500);
    });
    req.setTimeout(150, () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

async function waitForDevServer(urls: string[], timeoutMs = 15000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const results = await Promise.all(
      urls.map(async (u) => ((await probeDevServer(u)) ? u : null))
    );
    const readyUrl = results.find((u) => u !== null);
    if (readyUrl) {
      return readyUrl;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

export async function createWindow(): Promise<BrowserWindow> {
  const icon = resolveAppIcon();
  const preloadPath = path.resolve(__dirname, '../preload.js');

  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 640,
    title: 'OpenHepta',
    ...(icon && { icon }),
    autoHideMenuBar: true,
    backgroundColor: getWindowBackgroundColor(),
    show: false,
    ...(isMacOs && {
      titleBarStyle: 'hidden',
      frame: false,
      trafficLightPosition: { x: 13, y: 16 },
    }),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.setMenuBarVisibility(false);
  windows.add(win);
  mainWindow = win;

  win.on('focus', () => {
    mainWindow = win;
  });

  buildAndSetApplicationMenuOnce(
    () => {
      void createWindow();
    },
    () => getMainWindow()
  );

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] [level=${level}] ${message} (${sourceId}:${line})`);
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Renderer FailLoad] ${errorCode}: ${errorDescription} at ${validatedURL}`);
  });

  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) {
      win.show();
      win.focus();
    }
  });

  win.webContents.on('did-finish-load', () => {
    if (!win.isDestroyed() && !win.isVisible()) {
      win.show();
      win.focus();
    }
  });

  const distPath = path.join(ROOT_DIR, 'dist-renderer', 'index.html');

  if (process.env.WAIT_FOR_DEV_SERVER) {
    const readyUrl = await waitForDevServer(DEV_SERVER_URLS);
    if (win.isDestroyed()) return win;
    if (readyUrl) {
      await win.loadURL(readyUrl);
    } else if (fs.existsSync(distPath)) {
      await win.loadFile(distPath);
    }
  } else if (fs.existsSync(distPath)) {
    await win.loadFile(distPath);
  } else {
    const readyUrl = await waitForDevServer(DEV_SERVER_URLS, 2000);
    await win.loadURL(readyUrl ?? DEV_SERVER_URLS[0]);
  }

  win.on('closed', () => {
    windows.delete(win);
    if (mainWindow === win) {
      mainWindow = windows.values().next().value ?? null;
    }
  });

  return win;
}
