import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI } from '../src/domain/types';
const api: DesktopAPI = {
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: settings => ipcRenderer.invoke('settings:save', settings),
  load: () => ipcRenderer.invoke('banks:load'),
  save: bundle => ipcRenderer.invoke('banks:save', bundle),
  remove: id => ipcRenderer.invoke('banks:remove', id),
  chooseFile: () => ipcRenderer.invoke('files:choose'),
  exportFile: bundle => ipcRenderer.invoke('files:export', bundle),
  exportContent: content => ipcRenderer.invoke('files:export-content', content),
  dataDirectory: () => ipcRenderer.invoke('data:path'),
  openDataDirectory: () => ipcRenderer.invoke('data:open'),
  onBeforeClose: callback => {
    const listener = async () => {
      try { await callback(); await ipcRenderer.invoke('app:close-ready', true); }
      catch { await ipcRenderer.invoke('app:close-ready', false); }
    };
    ipcRenderer.on('app:before-close', listener);
    return () => ipcRenderer.removeListener('app:before-close', listener);
  },
};
contextBridge.exposeInMainWorld('recallmate', api);
