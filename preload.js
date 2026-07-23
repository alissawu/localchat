const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Storage
  loadData: () => ipcRenderer.invoke('storage:load'),
  saveData: (data) => ipcRenderer.invoke('storage:save', data),
  wipeAll: () => ipcRenderer.invoke('storage:wipe'),

  // Settings
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),

  // Tools
  webSearch: (query) => ipcRenderer.invoke('tool:web-search', query),
  webFetch: (url) => ipcRenderer.invoke('tool:web-fetch', url),
  spawnSubagent: (req) => ipcRenderer.invoke('tool:spawn-subagent', req),
});
