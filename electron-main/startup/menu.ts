import {
  App,
  BrowserWindow,
  Menu,
  MenuItem,
  MenuItemConstructorOptions,
} from 'electron';

const isMacOs = process.platform === 'darwin';
const isWindows = process.platform === 'win32';
let hasBuiltApplicationMenu = false;

function menuItemToConstructorOptions(item: MenuItem): MenuItemConstructorOptions {
  const role = item.role ? (item.role as MenuItemConstructorOptions['role']) : undefined;
  const options: MenuItemConstructorOptions = {
    type: item.type,
    label: item.label,
    enabled: item.enabled,
    visible: item.visible,
    checked: item.checked,
    registerAccelerator: item.registerAccelerator,
  };
  if (item.id) options.id = item.id;
  if (item.sublabel) options.sublabel = item.sublabel;
  if (item.toolTip) options.toolTip = item.toolTip;
  if (item.accelerator) options.accelerator = item.accelerator;
  if (item.icon) options.icon = item.icon;
  if (role) options.role = role;
  if (!role && typeof item.click === 'function') {
    options.click = item.click as MenuItemConstructorOptions['click'];
  }
  if (item.submenu) {
    options.submenu = item.submenu.items.map(menuItemToConstructorOptions);
  }
  return options;
}

export function buildAndSetApplicationMenuOnce(
  onNewWindow: () => void,
  getFocusedWindow?: () => BrowserWindow | null
): void {
  if (hasBuiltApplicationMenu) return;
  hasBuiltApplicationMenu = true;

  const currentMenu = Menu.getApplicationMenu();
  if (!currentMenu) {
    const fallbackTemplate: MenuItemConstructorOptions[] = [
      {
        label: 'File',
        submenu: [
          {
            label: 'New Window',
            accelerator: 'CommandOrControl+Shift+N',
            click: () => {
              onNewWindow();
            },
          },
          { label: 'Close Window', accelerator: 'CommandOrControl+Shift+W', role: 'close' },
        ],
      },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomIn', accelerator: 'CommandOrControl+=', visible: false },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
      { role: 'windowMenu' },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(fallbackTemplate));
    return;
  }

  const template = currentMenu.items.map(menuItemToConstructorOptions);
  for (const topItem of template) {
    if (!Array.isArray(topItem.submenu)) continue;
    const roleLower = typeof topItem.role === 'string' ? topItem.role.toLowerCase() : '';

    if (roleLower === 'appmenu') {
      for (const subItem of topItem.submenu) {
        const subRole = typeof subItem.role === 'string' ? subItem.role.toLowerCase() : '';
        if (subRole === 'about') subItem.label = 'About OpenHepta';
        else if (subRole === 'hide') subItem.label = 'Hide OpenHepta';
        else if (subRole === 'quit') subItem.label = 'Quit OpenHepta';
      }
    }

    if (roleLower === 'viewmenu') {
      topItem.submenu.push({
        role: 'zoomIn',
        accelerator: 'CommandOrControl+=',
        visible: false,
      });
    }

    if (roleLower === 'filemenu') {
      const closeIndex = topItem.submenu.findIndex(
        (subItem) => typeof subItem.role === 'string' && subItem.role.toLowerCase() === 'close'
      );
      if (closeIndex !== -1) {
        topItem.submenu.splice(closeIndex, 1, {
          label: 'Close Window',
          accelerator: 'CommandOrControl+Shift+W',
          role: 'close',
        });
      }
      topItem.submenu.push({
        label: 'New Window',
        accelerator: 'CommandOrControl+Shift+N',
        click: () => {
          onNewWindow();
        },
      });
    }

    if (roleLower === 'editmenu' && isMacOs) {
      const pasteIndex = topItem.submenu.findIndex(
        (subItem) => typeof subItem.role === 'string' && subItem.role.toLowerCase() === 'pasteandmatchstyle'
      );
      if (pasteIndex !== -1) {
        topItem.submenu.splice(
          pasteIndex,
          1,
          {
            label: 'Paste and Match Style',
            accelerator: 'CommandOrControl+Shift+V',
            click: () => {
              getFocusedWindow?.()?.webContents.pasteAndMatchStyle();
            },
          },
          {
            label: 'Paste and Match Style (Option)',
            accelerator: 'CommandOrControl+Option+Shift+V',
            visible: false,
            click: () => {
              getFocusedWindow?.()?.webContents.pasteAndMatchStyle();
            },
          }
        );
      }
    }
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

export function setupWindowsTaskList(appInstance: App): void {
  if (!isWindows) return;
  try {
    appInstance.setUserTasks([
      {
        program: process.execPath,
        arguments: '--new-window',
        iconPath: process.execPath,
        iconIndex: 0,
        title: 'New window',
        description: 'Create a new window',
      },
    ]);
  } catch (err) {
    console.warn('[OpenHepta] Failed to register Windows task list:', err);
  }
}
