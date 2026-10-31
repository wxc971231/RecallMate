const { app } = require('electron');
const path = require('node:path');
process.env.RECALLMATE_TEST = '1';
process.env.RECALLMATE_DATA_DIR = path.resolve(__dirname, '../artifacts/development-test');
process.env.ELECTRON_RENDERER_URL = 'http://127.0.0.1:5173';
app.commandLine.appendSwitch('disable-gpu');
app.on('browser-window-created', (_event, win) => {
  const errors = [];
  win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  win.webContents.once('did-finish-load', async () => {
    try {
      for (let i = 0; i < 60; i++) {
        const rendered = await win.webContents.executeJavaScript('document.querySelector(".first-bank") !== null');
        if (rendered) {
          const result = await win.webContents.executeJavaScript('window.recallmate.load()');
          if (result.bundles.length !== 0 || errors.length) throw new Error(errors.join('\n') || 'Unexpected development test data');
          console.log('PASS Development React refresh, renderer and sandboxed IPC'); app.exit(0); return;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error('Development renderer did not load: ' + errors.join('\n'));
    } catch (error) { console.error(error); app.exit(1); }
  });
});
require(path.resolve(__dirname, '../out/main/index.js'));
setTimeout(() => app.exit(1), 15000).unref();
