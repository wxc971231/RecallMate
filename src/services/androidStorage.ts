import { registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { validateBundle, validId, UnsupportedVersionError } from '../domain/banks';
import { defaultSettings, validateSettings } from '../domain/settings';
import type { Bundle, DesktopAPI } from '../domain/types';
import { assertFileSize, validateQuestionBankPackage } from '../domain/questionBankPackage';

interface RecordFile { id: string; main?: string; backup?: string }
interface NativeFiles {
  list(): Promise<{ records: RecordFile[]; warnings: string[] }>;
  readSettings(): Promise<{ main?: string; backup?: string }>;
  write(options: { id: string; text: string; previous?: string; preserve: boolean; legacyOriginal?: string }): Promise<void>;
  writeSettings(options: { text: string; previous?: string; preserve: boolean }): Promise<void>;
  remove(options: { id: string }): Promise<void>;
  chooseFile(): Promise<{ cancelled?: boolean; name?: string; text?: string }>;
  exportFile(options: { name: string; text: string }): Promise<{ saved: boolean }>;
}
const files = registerPlugin<NativeFiles>('RecallMateFiles');

// Keep only validated snapshots as backups. Native code never needs to guess
// whether a syntactically valid JSON file contains a valid practice session.
export function createAndroidStorage(native: NativeFiles = files): DesktopAPI {
  const previous = new Map<string, string>();
  const recovered = new Set<string>();
  const legacyOriginals = new Map<string,string>();
  const blocked = new Set<string>();
  let previousSettings: string | undefined;
  let preserveSettings = false;
  return {
    async load() {
      const result = await native.list();
      previous.clear();recovered.clear();legacyOriginals.clear();blocked.clear();
      const bundles: Bundle[] = [], warnings = [...result.warnings];
      for (const record of result.records) {
        if (!validId(record.id)) continue;
        let found = false;
        for (const [index, text] of [record.main, record.backup].entries()) {
          if (text === undefined) continue;
          try {
            const raw=JSON.parse(text),bundle = validateBundle(raw);
            if (bundle.bank.id !== record.id) throw new Error('题库 ID 不一致');
            bundles.push(bundle); previous.set(record.id, text); found = true;
            if(raw.schemaVersion===1)legacyOriginals.set(record.id,text);
            if (index === 1) { recovered.add(record.id); warnings.push(`“${bundle.bank.name}”已读取上一份有效备份，原损坏文件会保留。`); }
            break;
          } catch(error) {
            if(error instanceof UnsupportedVersionError){blocked.add(record.id);warnings.push(`题库 ${record.id} 使用不支持的版本，请升级应用；原文件未覆盖，也未退回旧备份。`);break;}
          }
        }
        if (!found&&!blocked.has(record.id)) { recovered.add(record.id); warnings.push(`题库 ${record.id} 无法读取，原文件已保留。可以从导出的 JSON 备份恢复。`); }
      }
      return { bundles, warnings };
    },
    async save(input) {
      const bundle = validateBundle(input), id = bundle.bank.id, text = JSON.stringify(bundle);
      assertFileSize(text);
      if(blocked.has(id))throw new Error('题库版本不兼容，禁止覆盖原文件');
      const legacyOriginal=legacyOriginals.get(id);
      await native.write({ id, text, previous: previous.get(id), preserve: recovered.has(id),...(legacyOriginal!==undefined?{legacyOriginal}:{}) });
      previous.set(id, text); recovered.delete(id);legacyOriginals.delete(id);
    },
    async remove(id) {
      if (!validId(id)) throw new Error('无效的题库 ID');
      await native.remove({ id }); previous.delete(id); recovered.delete(id);legacyOriginals.delete(id);blocked.delete(id);
    },
    async loadSettings() {
      const record = await native.readSettings();
      for (const [index, text] of [record.main, record.backup].entries()) {
        if (text === undefined) continue;
        try {
          const settings = validateSettings(JSON.parse(text)); previousSettings = text;
          preserveSettings = index === 1;
          return { settings, ...(index === 1 ? { warning: '字号设置已从上一份备份恢复。' } : {}) };
        } catch { preserveSettings = true; }
      }
      return { settings: { ...defaultSettings }, ...(preserveSettings ? { warning: '字号设置无法读取，暂用默认字号；原文件保留。' } : {}) };
    },
    async saveSettings(input) {
      const text = JSON.stringify(validateSettings(input));
      await native.writeSettings({ text, previous: previousSettings, preserve: preserveSettings });
      previousSettings = text; preserveSettings = false;
    },
    async chooseFile() {
      const result = await native.chooseFile();
      if (result.cancelled) return null;
      if (typeof result.name !== 'string' || typeof result.text !== 'string') throw new Error('文件读取失败，请重新选择');
      return { name: result.name, text: result.text.replace(/^\uFEFF/, '') };
    },
    async exportFile(input) {
      const bundle = validateBundle(input);
      const name = bundle.bank.name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 60) || 'RecallMate';
      return (await native.exportFile({ name: `${name}.recallmate.json`, text: JSON.stringify(bundle, null, 2) })).saved;
    },
    async dataDirectory() { return '本机应用私有存储'; },
    async exportContent(input) {
      const content=validateQuestionBankPackage(input),name=content.bank.name.replace(/[<>:"/\\|?*\x00-\x1F]/g,'_').slice(0,60)||'RecallMate';
      return (await native.exportFile({name:`${name}.questionbank.json`,text:JSON.stringify(content,null,2)})).saved;
    },
    async openDataDirectory() { throw new Error('请通过“导出备份”保存到手机可访问的位置'); },
    onBeforeClose(callback) {
      let cancelled = false;
      const pending = App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive && !cancelled) void callback().catch(() => { /* Save UI retains its error/retry state. */ });
      });
      const visibility = () => { if (document.hidden && !cancelled) void callback().catch(() => {}); };
      document.addEventListener('visibilitychange', visibility);
      return () => { cancelled = true; document.removeEventListener('visibilitychange', visibility); void pending.then(listener => listener.remove()); };
    },
  };
}
