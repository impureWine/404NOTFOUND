const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopPet', Object.freeze({
  setClickThrough(enabled) {
    ipcRenderer.send('pet:set-click-through', Boolean(enabled));
  },
  hide() {
    ipcRenderer.send('pet:hide');
  },
  close() {
    ipcRenderer.send('pet:close');
  },
  onClickThroughChanged(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, enabled) => callback(Boolean(enabled));
    ipcRenderer.on('pet:click-through-changed', listener);
    return () => ipcRenderer.removeListener('pet:click-through-changed', listener);
  },
}));
