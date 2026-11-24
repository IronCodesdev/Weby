const { app, BrowserWindow, ipcMain, Menu, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');

// Ensure switches for environments requiring no-sandbox or software acceleration
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-dev-shm-usage');

try {
  const defaultUserData = app.getPath('userData');
  if (!fs.existsSync(defaultUserData)) {
    fs.mkdirSync(defaultUserData, { recursive: true });
  }
} catch (e) {
  const fallbackDir = path.join(app.getPath('temp'), 'weby_userdata');
  if (!fs.existsSync(fallbackDir)) {
    fs.mkdirSync(fallbackDir, { recursive: true });
  }
  app.setPath('userData', fallbackDir);
}

const SessionManager = require('./session-manager');

let mainWindow = null;
const sessionManager = new SessionManager();

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 800,
    minHeight: 600,
    title: 'Weby - Multi-Session Browser',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  setupMenu();
}

function setupMenu() {
  const { activeProfileId, profiles } = sessionManager.getProfiles();

  const profileMenuItems = profiles.map(p => ({
    label: p.name,
    type: 'radio',
    checked: p.id === activeProfileId,
    click: () => {
      sessionManager.switchProfile(p.id);
      setupMenu();
      if (mainWindow) {
        mainWindow.webContents.send('weby:menu-action', 'profile-switched', p.id);
      }
    }
  }));

  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Isolated Tab',
          accelerator: 'CmdOrCtrl+T',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('weby:menu-action', 'new-tab');
            }
          }
        },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('weby:menu-action', 'close-tab');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('weby:menu-action', 'open-settings');
            }
          }
        },
        {
          label: 'Sessions Control Panel',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('weby:menu-action', 'open-sessions');
            }
          }
        },
        {
          label: 'Extensions Manager',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('weby:menu-action', 'open-extensions');
            }
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload Current Tab',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('weby:menu-action', 'reload');
            }
          }
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'F12',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.toggleDevTools();
            }
          }
        }
      ]
    },
    {
      label: 'Profiles',
      submenu: [
        ...profileMenuItems,
        { type: 'separator' },
        {
          label: 'New Profile...',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('weby:menu-action', 'new-profile');
            }
          }
        },
        {
          label: 'Manage Profiles...',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('weby:menu-action', 'open-profiles');
            }
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC Handlers - Core State
ipcMain.handle('weby:load-state', async () => {
  return sessionManager.loadState();
});

ipcMain.handle('weby:save-state', async (event, state) => {
  return sessionManager.saveState(state);
});

ipcMain.handle('weby:create-tab', async (event, data) => {
  return sessionManager.createTabMetadata(data);
});

ipcMain.handle('weby:get-cookies', async (event, { partition, url }) => {
  return await sessionManager.getCookies(partition, url);
});

ipcMain.handle('weby:clear-partition', async (event, partition) => {
  return await sessionManager.clearPartition(partition);
});

// IPC Handlers - Profiles
ipcMain.handle('weby:get-profiles', async () => {
  return sessionManager.getProfiles();
});

ipcMain.handle('weby:create-profile', async (event, name) => {
  const profile = sessionManager.createProfile(name);
  setupMenu();
  return profile;
});

ipcMain.handle('weby:rename-profile', async (event, { id, name }) => {
  const profile = sessionManager.renameProfile(id, name);
  setupMenu();
  return profile;
});

ipcMain.handle('weby:delete-profile', async (event, id) => {
  const result = sessionManager.deleteProfile(id);
  setupMenu();
  return result;
});

ipcMain.handle('weby:switch-profile', async (event, id) => {
  const profile = sessionManager.switchProfile(id);
  setupMenu();
  return profile;
});

// IPC Handlers - Settings
ipcMain.handle('weby:get-settings', async () => {
  return sessionManager.getSettings();
});

ipcMain.handle('weby:save-settings', async (event, settings) => {
  return sessionManager.saveSettings(settings);
});

// IPC Handlers - Advanced Sessions Control Panel
ipcMain.handle('weby:get-sessions', async () => {
  return await sessionManager.getSessionsWithMetadata();
});

ipcMain.handle('weby:rename-session', async (event, { id, name }) => {
  return await sessionManager.renameSession(id, name);
});

ipcMain.handle('weby:duplicate-session', async (event, id) => {
  return await sessionManager.duplicateSession(id);
});

ipcMain.handle('weby:delete-session', async (event, id) => {
  return await sessionManager.deleteSession(id);
});

ipcMain.handle('weby:export-cookies', async (event, partition) => {
  return await sessionManager.exportCookies(partition);
});

ipcMain.handle('weby:import-cookies', async (event, { partition, cookiesJson }) => {
  return await sessionManager.importCookies(partition, cookiesJson);
});

// IPC Handlers - Chrome Extensions
ipcMain.handle('weby:get-extensions', async () => {
  return sessionManager.getExtensions();
});

ipcMain.handle('weby:add-extension-prompt', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Unpacked Chrome Extension Folder',
    properties: ['openDirectory']
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }

  const extPath = result.filePaths[0];
  const newExt = sessionManager.addExtension(extPath);

  // Apply to all active partitions for current profile
  const state = sessionManager.loadState();
  if (state && Array.isArray(state.tabs)) {
    for (const tab of state.tabs) {
      if (tab.partition) {
        const ses = session.fromPartition(tab.partition);
        await sessionManager.applyExtensionsToSession(ses);
      }
    }
  }

  return newExt;
});

ipcMain.handle('weby:add-extension-path', async (event, extPath) => {
  const newExt = sessionManager.addExtension(extPath);
  const state = sessionManager.loadState();
  if (state && Array.isArray(state.tabs)) {
    for (const tab of state.tabs) {
      if (tab.partition) {
        const ses = session.fromPartition(tab.partition);
        await sessionManager.applyExtensionsToSession(ses);
      }
    }
  }
  return newExt;
});

ipcMain.handle('weby:toggle-extension', async (event, { id, enabled }) => {
  const updated = sessionManager.toggleExtension(id, enabled);
  return updated;
});

ipcMain.handle('weby:remove-extension', async (event, id) => {
  return sessionManager.removeExtension(id);
});

// Configure webview security and extension loading
app.on('web-contents-created', (event, contents) => {
  contents.on('will-attach-webview', async (wvEvent, webPreferences, params) => {
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;

    if (params && params.partition) {
      try {
        const ses = session.fromPartition(params.partition);
        await sessionManager.applyExtensionsToSession(ses);
      } catch (e) {
        console.warn('[Webview] Error applying extensions to partition:', e);
      }
    }
  });

  contents.setWindowOpenHandler(() => {
    return { action: 'allow' };
  });
});

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});