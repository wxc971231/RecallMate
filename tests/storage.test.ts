import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { exportBundleToDirectory, FileStore } from '../electron/storage';
import { createBank } from '../src/domain/banks';

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'recallmate-test-')); });
afterEach(async () => {
  const target = resolve(root), tempRoot = resolve(tmpdir());
  if (!target.startsWith(tempRoot + sep) || !target.split(sep).at(-1)!.startsWith('recallmate-test-')) throw new Error('拒绝清理意外路径');
  await rm(target, { recursive: true, force: true });
});
describe('本地 JSON 存储与恢复', () => {
  it('并发保存串行执行，最后的状态不会回退', async () => {
    const store = new FileStore(root), b = createBank('{{甲}}');
    await Promise.all(Array.from({ length: 8 }, (_, i) => store.save({ ...b, bank: { ...b.bank, name: `版本${i}` } })));
    expect((await store.load()).bundles[0].bank.name).toBe('版本7');
    const backup = JSON.parse(await readFile(join(root, 'backups', `${b.bank.id}.json.bak`), 'utf8'));
    expect(backup.bank.name).toBe('版本6');
  });
  it('损坏主文件时读备份，后续保存保留损坏原件与有效备份', async () => {
    const store = new FileStore(root), b = createBank('{{甲}}');
    await store.save(b); await store.save(b);
    await writeFile(join(root, 'banks', `${b.bank.id}.json`), '{损坏');
    const restored = await store.load(); expect(restored.bundles).toEqual([b]); expect(restored.warnings).toHaveLength(1);
    await store.save(b);
    expect((await readdir(join(root, 'banks'))).some(f => f.includes('.corrupt-'))).toBe(true);
    expect(JSON.parse(await readFile(join(root, 'backups', `${b.bank.id}.json.bak`), 'utf8'))).toEqual(b);
  });
  it('双份损坏时保留原件，并禁止静默覆盖', async () => {
    const store = new FileStore(root), b = createBank('{{甲}}'); await store.save(b);
    const path = join(root, 'banks', `${b.bank.id}.json`); await writeFile(path, '{损坏');
    expect((await store.load()).bundles).toEqual([]); await expect(store.save(b)).rejects.toThrow('禁止覆盖');
    expect(await readFile(path, 'utf8')).toBe('{损坏');
  });
  it('题库删除同时清理主文件与备份', async () => {
    const store = new FileStore(root), b = createBank('{{甲}}'); await store.save(b); await store.save(b); await store.remove(b.bank.id);
    expect((await store.load()).bundles).toEqual([]); expect(await readdir(join(root, 'backups'))).toEqual([]);
  });
  it('拒绝目录穿越与不受支持的版本', async () => {
    const store = new FileStore(root); expect(() => store.remove('../escape')).toThrow('ID');
    expect(() => store.save({ ...createBank('{{甲}}'), schemaVersion: 999 })).toThrow('版本');
  });
  it('导出备份只写入指定目录，重复导出不覆盖已有文件', async () => {
    const b = createBank('# 路径/测试\n{{甲}}'), directory = join(root, 'exports');
    const first = await exportBundleToDirectory(b, directory), second = await exportBundleToDirectory(b, directory);
    expect(first.startsWith(directory + sep)).toBe(true); expect(second).not.toBe(first);
    expect(JSON.parse(await readFile(first, 'utf8'))).toEqual(b); expect(await readdir(directory)).toHaveLength(2);
  });
});
