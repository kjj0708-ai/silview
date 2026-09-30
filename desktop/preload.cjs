const { contextBridge, ipcRenderer, webUtils } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('silviewDesktop', {
  getLibrary: () => ipcRenderer.invoke('silview:library'),
  onLibrary: callback => subscribe('silview:library-changed', callback),
  onError: callback => subscribe('silview:error', callback),
  openFiles: files => ipcRenderer.invoke('silview:open-paths', files.map(file => webUtils.getPathForFile(file)).filter(Boolean)),
  openImages: () => ipcRenderer.invoke('silview:open-images'),
  openFolder: () => ipcRenderer.invoke('silview:open-folder'),
  saveImage: (url, name) => ipcRenderer.invoke('silview:save-image', url, name),
  saveAll: images => ipcRenderer.invoke('silview:save-all', images),
  printImage: url => ipcRenderer.invoke('silview:print-image', url),
  openDefaultApps: () => ipcRenderer.invoke('silview:default-apps'),
});
