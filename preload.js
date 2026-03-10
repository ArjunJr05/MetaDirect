const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    fetchLinkPreview: (url) => ipcRenderer.invoke('fetch-link-preview', url)
});