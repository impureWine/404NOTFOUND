const { app, BrowserWindow, globalShortcut, ipcMain, session } = require('electron');
const path = require('node:path');

let petWindow = null;
let clickThrough = false;

function isPetSender(event) {
  return Boolean(petWindow && !petWindow.isDestroyed() && event.sender === petWindow.webContents);
}

function setClickThrough(enabled) {
  clickThrough = Boolean(enabled);
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.setIgnoreMouseEvents(clickThrough, { forward: true });
    petWindow.webContents.send('pet:click-through-changed', clickThrough);
  }
}

function createPetWindow() {
  petWindow = new BrowserWindow({
    width: 380,
    height: 280,
    minWidth: 320,
    minHeight: 240,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  petWindow.setAlwaysOnTop(true, 'floating');
  petWindow.loadFile(path.join(__dirname, 'renderer.html'));
  petWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  petWindow.webContents.on('will-navigate', event => event.preventDefault());
  petWindow.webContents.on('render-process-gone', () => {
    if (petWindow && !petWindow.isDestroyed()) petWindow.destroy();
    petWindow = null;
    clickThrough = false;
  });
  petWindow.on('closed', () => {
    petWindow = null;
    clickThrough = false;
  });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  ipcMain.on('pet:set-click-through', (event, enabled) => {
    if (isPetSender(event)) setClickThrough(enabled);
  });
  ipcMain.on('pet:hide', event => {
    if (isPetSender(event)) petWindow.hide();
  });
  ipcMain.on('pet:close', event => {
    if (isPetSender(event)) petWindow.close();
  });
  globalShortcut.register('Alt+Shift+P', () => setClickThrough(false));
  createPetWindow();
});

app.on('before-quit', () => {
  globalShortcut.unregister('Alt+Shift+P');
  if (petWindow && !petWindow.isDestroyed()) {
    setClickThrough(false);
    petWindow.destroy();
  }
  petWindow = null;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
