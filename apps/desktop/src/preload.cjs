const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('openfactory', {
  platform: process.platform,
  invoke: (operation, payload) =>
    ipcRenderer.invoke('openfactory', operation, payload).catch((error) => {
      throw new Error(
        error.message.replace(/^Error invoking remote method 'openfactory': (?:Error: )?/, ''),
      );
    }),
  onSync: (callback) => {
    const listener = (_event, update) => callback(update);
    ipcRenderer.on('sync-change', listener);
    return () => ipcRenderer.removeListener('sync-change', listener);
  },
  onPairingLink: (callback) => {
    ipcRenderer.on('pairing-link', (_event, link) => callback(link));
  },
});
