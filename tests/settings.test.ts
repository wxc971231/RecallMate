import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { defaultSettings, validateSettings } from '../src/domain/settings';
import { SettingsStore } from '../electron/settingsStore';

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'recallmate-settings-test-')); });
afterEach(async () => { const checked = resolve(root); if (!checked.startsWith(resolve(tmpdir()) + sep) || !checked.split(sep).at(-1)!.startsWith('recallmate-settings-test-')) throw new Error('Unexpected cleanup directory'); await rm(checked, { recursive: true, force: true }); });
describe('字号设置', () => {
  it('快捷键与字号一并保存，重开后恢复自定义和停用项', async () => {
    const settings={...defaultSettings,shortcuts:{...defaultSettings.shortcuts,hint:'Ctrl+H',skip:null}};
    await new SettingsStore(root).save(settings);
    expect((await new SettingsStore(root).load()).settings).toEqual(settings);
  });
  it('新用户使用默认字号，不会主动写文件', async () => { const store = new SettingsStore(root); expect((await store.load()).settings).toEqual(defaultSettings); expect(await readdir(root)).toEqual([]); });
  it.each([{ uiFontSize: 11 }, { uiFontSize: 21 }, { practiceFontSize: 17 }, { practiceFontSize: 41 }, { uiFontSize: 14.5 }, { schemaVersion: 2 }])('拒绝无效设置 %j', patch => expect(() => validateSettings({ ...defaultSettings, ...patch })).toThrow());
  it('快速调节串行保存，最后的字号可被新实例恢复', async () => { const store = new SettingsStore(root); await Promise.all([28, 32, 40].map(practiceFontSize => store.save({ ...defaultSettings, uiFontSize: 20, practiceFontSize }))); expect((await new SettingsStore(root).load()).settings).toMatchObject({ uiFontSize: 20, practiceFontSize: 40 }); expect(JSON.parse(await readFile(join(root, 'app-settings.json.bak'), 'utf8')).practiceFontSize).toBe(32); });
  it('主设置损坏后从备份恢复，保存时保留损坏原件', async () => { const store = new SettingsStore(root); await store.save(defaultSettings); await store.save({ ...defaultSettings, practiceFontSize: 30 }); await writeFile(join(root, 'app-settings.json'), '{invalid'); expect(await store.load()).toMatchObject({ settings: defaultSettings, warning: expect.any(String) }); await store.save({ ...defaultSettings, practiceFontSize: 36 }); expect((await readdir(root)).some(name => name.startsWith('app-settings.json.corrupt-'))).toBe(true); });
  it('读到不支持的值不应用异常字号，原件仍保留', async () => { await writeFile(join(root, 'app-settings.json'), '{"schemaVersion":1,"uiFontSize":999,"practiceFontSize":40}'); const store = new SettingsStore(root); expect((await store.load()).settings).toEqual(defaultSettings); expect(await readFile(join(root, 'app-settings.json'), 'utf8')).toContain('999'); });
});
