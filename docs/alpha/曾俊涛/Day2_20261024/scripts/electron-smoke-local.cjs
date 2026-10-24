const { app, BrowserWindow, globalShortcut } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const outputDir = process.env.TEST_OUTPUT_DIR || process.cwd();
const report = { electronVersion: process.versions.electron, source: 'main@230293d original Electron source with local test observer', observations: {} };
let petWindow;
app.on('browser-window-created', (_event, window) => { petWindow = window; });
require('./main.cjs');

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for desktop state');
    await pause(50);
  }
}

app.whenReady().then(async () => {
  try {
    await until(() => petWindow && !petWindow.isDestroyed());
    const win = petWindow;
    await until(() => !win.webContents.isLoadingMainFrame());
    await until(() => win.isVisible());
    report.observations.launch = {
      visible: win.isVisible(),
      alwaysOnTopAfterOriginalSetup: win.isAlwaysOnTop(),
      noMenuBar: !win.isMenuBarVisible(),
      url: win.webContents.getURL(),
      emergencyShortcutRegistered: globalShortcut.isRegistered('Alt+Shift+P'),
      bounds: win.getBounds(),
    };
    win.setAlwaysOnTop(true, 'floating');
    report.observations.launch.alwaysOnTopAfterExplicitReassert = win.isAlwaysOnTop();
    const initial = await win.webContents.executeJavaScript("({status:document.querySelector('[data-status]').textContent,pressed:document.querySelector('[data-action=click-through]').getAttribute('aria-pressed')})");
    report.observations.initialRenderer = initial;
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outputDir, 'electron-running-230293d.png'), image.toPNG());

    const ignoreCalls = [];
    const originalIgnore = win.setIgnoreMouseEvents.bind(win);
    win.setIgnoreMouseEvents = (enabled, options) => {
      ignoreCalls.push({ enabled, forward: options?.forward === true });
      return originalIgnore(enabled, options);
    };
    await win.webContents.executeJavaScript("document.querySelector('[data-action=click-through]').click()");
    await until(() => ignoreCalls.length >= 1);
    const enabled = await win.webContents.executeJavaScript("({status:document.querySelector('[data-status]').textContent,pressed:document.querySelector('[data-action=click-through]').getAttribute('aria-pressed')})");
    await win.webContents.executeJavaScript("document.querySelector('[data-action=click-through]').click()");
    await until(() => ignoreCalls.length >= 2);
    const restored = await win.webContents.executeJavaScript("({status:document.querySelector('[data-status]').textContent,pressed:document.querySelector('[data-action=click-through]').getAttribute('aria-pressed')})");
    report.observations.clickThrough = { ignoreCalls, enabled, restored };

    const beforeDrag = win.getBounds();
    win.webContents.sendInputEvent({ type: 'mouseDown', x: 110, y: 20, button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseMove', x: 170, y: 60, movementX: 60, movementY: 40 });
    win.webContents.sendInputEvent({ type: 'mouseUp', x: 170, y: 60, button: 'left', clickCount: 1 });
    await pause(100);
    const afterDrag = win.getBounds();
    report.observations.drag = { before: beforeDrag, after: afterDrag, moved: beforeDrag.x !== afterDrag.x || beforeDrag.y !== afterDrag.y };

    await win.webContents.executeJavaScript("document.querySelector('[data-action=hide]').click()");
    await until(() => !win.isVisible());
    report.observations.hide = { hidden: !win.isVisible() };
    win.show();
    await until(() => win.isVisible());
    report.observations.reopenForClose = { visible: win.isVisible() };
    report.observations.close = { buttonInvoked: true, closed: false };
    win.once('closed', () => {
      report.observations.close.closed = true;
      fs.writeFileSync(path.join(outputDir, 'electron-smoke-230293d.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
    });
    await win.webContents.executeJavaScript("document.querySelector('[data-action=close]').click()").catch(() => {});
  } catch (error) {
    report.error = { name: error.name, message: error.message };
    fs.writeFileSync(path.join(outputDir, 'electron-smoke-230293d.json'), JSON.stringify(report, null, 2));
    console.error(JSON.stringify(report, null, 2));
    app.quit();
    process.exitCode = 1;
  }
});
