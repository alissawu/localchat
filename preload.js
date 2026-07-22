const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Storage
  loadData: () => ipcRenderer.invoke('storage:load'),
  saveData: (data) => ipcRenderer.invoke('storage:save', data),
  wipeAll: () => ipcRenderer.invoke('storage:wipe'),
  
  // Settings
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
});
