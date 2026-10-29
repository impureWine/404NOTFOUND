const { app, BrowserWindow, globalShortcut, ipcMain, session } = require('electron');
const path = require('node:path');

let petWindow = null;
let workspaceWindow = null;
let pressureWindow = null;
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

function openWorkspace() {
  const target = new URL(process.env.DESKTOP_APP_URL || 'http://127.0.0.1:5174');
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.pathname !== '/') throw new Error('DESKTOP_APP_URL 必须为受信任的应用根地址');
  if (target.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(target.hostname)) throw new Error('非本机地址必须使用 HTTPS');
  if (workspaceWindow && !workspaceWindow.isDestroyed()) { workspaceWindow.show(); workspaceWindow.focus(); return; }
  workspaceWindow = new BrowserWindow({ width: 1180, height: 850, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: 'persist:404-desktop' } });
  workspaceWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  workspaceWindow.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== target.origin) event.preventDefault(); });
  workspaceWindow.on('closed', () => { workspaceWindow = null; });
  workspaceWindow.loadURL(target.href).catch(() => { if (workspaceWindow && !workspaceWindow.isDestroyed()) workspaceWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<h1>真实服务未连接</h1><p>请先启动桌面入口的前后端服务，再重新打开工作台。</p>')); });
}

function openPressure() {
  if (pressureWindow && !pressureWindow.isDestroyed()) { pressureWindow.show(); return; }
  const target = new URL(process.env.DESKTOP_APP_URL || 'http://127.0.0.1:5174');
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || (target.protocol === 'http:' && !['127.0.0.1','localhost'].includes(target.hostname))) return;
  target.search = '?overlay=pressure'; target.hash = 'pressure';
  pressureWindow = new BrowserWindow({ transparent: true, frame: false, fullscreen: true, alwaysOnTop: true, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: 'persist:404-desktop' } });
  pressureWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  pressureWindow.webContents.on('will-navigate', (event,url) => { if (new URL(url).origin !== target.origin) event.preventDefault(); });
  pressureWindow.webContents.on('before-input-event', (_event,input) => { if (input.key === 'Escape' && pressureWindow && !pressureWindow.isDestroyed()) pressureWindow.close(); });
  pressureWindow.on('closed', () => { pressureWindow = null; });
  pressureWindow.loadURL(target.href).catch(() => { if (pressureWindow && !pressureWindow.isDestroyed()) pressureWindow.close(); });
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
  ipcMain.on('pet:open-pressure', event => { if (isPetSender(event)) openPressure(); });
  ipcMain.on('pet:open-workspace', event => { if (isPetSender(event)) openWorkspace(); });
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
  openWorkspace();
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
