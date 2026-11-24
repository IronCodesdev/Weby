const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('webyAPI', {
  // Tabs & Core State
  loadState: () => ipcRenderer.invoke('weby:load-state'),
  saveState: (state) => ipcRenderer.invoke('weby:save-state', state),
  createTab: (data) => ipcRenderer.invoke('weby:create-tab', data),
  getCookies: (partition, url) => ipcRenderer.invoke('weby:get-cookies', { partition, url }),
  clearPartition: (partition) => ipcRenderer.invoke('weby:clear-partition', partition),
  onMenuAction: (callback) => {
    ipcRenderer.on('weby:menu-action', (event, action, data) => callback(action, data));
  },

  // Profiles API
  getProfiles: () => ipcRenderer.invoke('weby:get-profiles'),
  createProfile: (name) => ipcRenderer.invoke('weby:create-profile', name),
  renameProfile: (id, name) => ipcRenderer.invoke('weby:rename-profile', { id, name }),
  deleteProfile: (id) => ipcRenderer.invoke('weby:delete-profile', id),
  switchProfile: (id) => ipcRenderer.invoke('weby:switch-profile', id),

  // Settings & Theme API
  getSettings: () => ipcRenderer.invoke('weby:get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('weby:save-settings', settings),

  // Advanced Sessions Control Panel API
  getSessions: () => ipcRenderer.invoke('weby:get-sessions'),
  renameSession: (id, name) => ipcRenderer.invoke('weby:rename-session', { id, name }),
  duplicateSession: (id) => ipcRenderer.invoke('weby:duplicate-session', id),
  deleteSession: (id) => ipcRenderer.invoke('weby:delete-session', id),
  exportCookies: (partition) => ipcRenderer.invoke('weby:export-cookies', partition),
  importCookies: (partition, cookiesJson) => ipcRenderer.invoke('weby:import-cookies', { partition, cookiesJson }),

  // Chrome Extensions API
  getExtensions: () => ipcRenderer.invoke('weby:get-extensions'),
  addExtensionPrompt: () => ipcRenderer.invoke('weby:add-extension-prompt'),
  addExtensionPath: (path) => ipcRenderer.invoke('weby:add-extension-path', path),
  toggleExtension: (id, enabled) => ipcRenderer.invoke('weby:toggle-extension', { id, enabled }),
  removeExtension: (id) => ipcRenderer.invoke('weby:remove-extension', id)
});