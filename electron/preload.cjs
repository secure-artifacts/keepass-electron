const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('keepassAPI', {
  pickServiceJson: () => ipcRenderer.invoke('dialog:service-json'),
  pickOutputDir: () => ipcRenderer.invoke('dialog:output-dir'),
  loadServiceEmail: (path) => ipcRenderer.invoke('backend:service-email', { path }),
  fetchSheet: (payload) => ipcRenderer.invoke('backend:fetch-sheet', payload),
  generate: (payload) => ipcRenderer.invoke('backend:generate', payload),
  openPath: (targetPath) => ipcRenderer.invoke('shell:open-path', targetPath),
  getVersion: () => ipcRenderer.invoke('app:version'),
  getDefaultOutput: () => ipcRenderer.invoke('app:default-output'),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  onProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('backend:progress', listener);
    return () => ipcRenderer.removeListener('backend:progress', listener);
  }
});
