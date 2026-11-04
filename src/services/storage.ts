import { validateBundle } from '../domain/banks';
import type { Bundle, DesktopAPI } from '../domain/types';
import { defaultSettings, validateSettings } from '../domain/settings';
import { isAndroid } from './platform';
import { createAndroidStorage } from './androidStorage';
import { validateQuestionBankPackage } from '../domain/questionBankPackage';
declare global { interface Window { recallmate?: DesktopAPI } }

// The browser preview uses its own local storage; the desktop always uses JSON files via IPC.
const browserAPI: DesktopAPI = {
  async loadSettings() { const text = localStorage.getItem('recallmate.settings'); return { settings: text ? validateSettings(JSON.parse(text)) : { ...defaultSettings } }; },
  async saveSettings(settings) { localStorage.setItem('recallmate.settings', JSON.stringify(validateSettings(settings))); },
  async load() {
    const bundles: Bundle[] = [], warnings: string[] = [];
    for (const key of Object.keys(localStorage).filter(k => k.startsWith('recallmate.bank.'))) {
      try { bundles.push(validateBundle(JSON.parse(localStorage.getItem(key)!))); }
      catch { warnings.push(`浏览器中的题库 ${key} 无法读取，原始数据已保留。`); }
    }
    return { bundles, warnings };
  },
  async save(input) {
    const bundle=validateBundle(input),key=`recallmate.bank.${bundle.bank.id}`,previous=localStorage.getItem(key);
    if(previous){
      const raw=JSON.parse(previous);
      if(typeof raw.schemaVersion==='number'&&raw.schemaVersion>2)throw new Error('原题库属于更高版本，禁止覆盖');
      if(raw.schemaVersion===1){validateBundle(raw);const archive=`recallmate.migration.v1.${bundle.bank.id}`;if(!localStorage.getItem(archive))localStorage.setItem(archive,previous);}
    }
    localStorage.setItem(key,JSON.stringify(bundle));
  },
  async remove(id) { localStorage.removeItem(`recallmate.bank.${id}`); },
  async chooseFile() {
    return new Promise(resolve => {
      const input = document.createElement('input'); input.type = 'file'; input.accept = '.md,.txt,.json';
      input.onchange = async () => { const file = input.files?.[0]; resolve(file ? { name: file.name, text: await file.text() } : null); };
      input.addEventListener('cancel', () => resolve(null)); input.click();
    });
  },
  async exportFile(bundle) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `${bundle.bank.name}.recallmate.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); return true;
  },
  async dataDirectory() { return '浏览器预览：数据保存在当前浏览器。桌面版使用本地 JSON 文件。'; },
  async exportContent(input) {
    const content=validateQuestionBankPackage(input), url=URL.createObjectURL(new Blob([JSON.stringify(content,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=`${content.bank.name}.questionbank.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return true;
  },
  async openDataDirectory() { throw new Error('请在桌面版中打开数据目录'); },
  onBeforeClose: () => () => {},
};
export const storage = isAndroid ? createAndroidStorage() : window.recallmate ?? browserAPI;

let queue = Promise.resolve();
const failures = new Map<string, unknown>();
export function saveBundle(bundle: Bundle) {
  const snapshot = structuredClone(bundle);
  const task = queue.catch(() => {}).then(() => storage.save(snapshot));
  queue = task;
  task.then(() => failures.delete(bundle.bank.id), error => failures.set(bundle.bank.id, error));
  return task;
}
export function removeBundle(id: string) {
  const task = queue.catch(() => {}).then(() => storage.remove(id));
  queue = task;
  task.then(() => failures.delete(id), error => failures.set(id, error));
  return task;
}
export async function flushSaves() { await queue; if (failures.size) throw new Error('部分题库未能保存，请重试'); }
