import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { exportBundleToDirectory, exportContentToDirectory, FileStore } from './storage';
import { validateBundle } from '../src/domain/banks';
import { configureRuntimePaths, resolveRuntimePaths } from './runtimePaths';
import { SettingsStore } from './settingsStore';

let window: BrowserWindow | null = null;
let store: FileStore;
let settingsStore: SettingsStore;
let allowClose = false;
let closing = false;
const directory = typeof __dirname !== 'undefined' ? __dirname : fileURLToPath(new URL('.', import.meta.url));
const rendererPath = join(directory, '../renderer/index.html');
const developmentURL = process.env.ELECTRON_RENDERER_URL;
app.setName('RecallMate');
const runtime = resolveRuntimePaths({
  packaged: app.isPackaged,
  executable: app.getPath('exe'),
  project: process.cwd(),
  developmentData: process.env.RECALLMATE_DATA_DIR,
  testPortableRoot: process.env.RECALLMATE_TEST === '1' ? process.env.RECALLMATE_TEST_PORTABLE_ROOT : undefined,
});
try {
  configureRuntimePaths(app, runtime);
  if (runtime.portable) process.chdir(runtime.root);
} catch (error) {
  dialog.showErrorBox('无法写入便携版数据目录', `请将整个 RecallMate 文件夹放到可以写入的位置后重试。软件不会改用 AppData 保存。\n\n${error instanceof Error ? error.message : error}`);
  app.exit(1);
  throw error;
}
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });

function handle(channel: string, callback: (...args: any[]) => any) {
  ipcMain.handle(channel, (event, ...args) => {
    const url = event.senderFrame?.url;
    if (!window || event.sender.id !== window.webContents.id || (url !== pathToFileURL(rendererPath).href && !(developmentURL && url?.startsWith(developmentURL + '/')) && url !== developmentURL)) throw new Error('无法验证请求来源');
    return callback(...args);
  });
}

if (locked) app.whenReady().then(() => {
  store = new FileStore(app.getPath('userData'));
  settingsStore = new SettingsStore(app.getPath('userData'));
  handle('settings:load', () => settingsStore.load());
  handle('settings:save', (settings: unknown) => settingsStore.save(settings));
  handle('banks:load', () => store.load());
  handle('banks:save', (bundle: unknown) => store.save(bundle));
  handle('banks:remove', (id: string) => store.remove(id));
  handle('files:choose', async () => {
    const selected = await dialog.showOpenDialog(window!, { title: '导入题库或恢复备份', defaultPath: runtime.root, properties: ['openFile', 'dontAddToRecent'], filters: [{ name: '题库与备份', extensions: ['md', 'txt', 'json'] }] });
    if (selected.canceled) return null;
    const path = selected.filePaths[0];
    if ((await stat(path)).size > 20 * 1024 * 1024) throw new Error('文件过大，请选择小于 20 MB 的文件');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(path));
    return { name: path.split(/[\\/]/).pop()!, text };
  });
  handle('files:export', async (input: unknown) => {
    const bundle = validateBundle(input);
    await exportBundleToDirectory(bundle, runtime.exports);
    return true;
  });
  handle('data:path', () => app.getPath('userData'));
  handle('files:export-content', async (input: unknown) => { await exportContentToDirectory(input, runtime.exports); return true; });
  handle('data:open', async () => { const error = await shell.openPath(app.getPath('userData')); if (error) throw new Error(error); });
  handle('app:close-ready', async (saved: boolean) => {
    if (!closing) return;
    if (!saved) { closing = false; return; }
    try { await store.flush(); await settingsStore.flush(); allowClose = true; window?.close(); }
    catch { closing = false; }
  });
  window = new BrowserWindow({
    show: process.env.RECALLMATE_TEST !== '1',
    width: 1180, height: 820, minWidth: 760, minHeight: 600,
    title: 'RecallMate', backgroundColor: '#f5f7f8', autoHideMenuBar: true,
    icon: join(directory, '../renderer/icon.png'),
    webPreferences: { preload: join(directory, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, offscreen: process.env.RECALLMATE_TEST === '1' },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== pathToFileURL(rendererPath).href && !(developmentURL && url === developmentURL + '/')) event.preventDefault();
  });
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.on('close', event => {
    if (allowClose) return;
    event.preventDefault();
    if (!closing) { closing = true; window?.webContents.send('app:before-close'); }
  });
  window.on('closed', () => { window = null; });
  if (developmentURL) window.loadURL(developmentURL);
  else window.loadFile(rendererPath);
});
app.on('window-all-closed', () => app.quit());
