import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, rm, readdir, mkdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { exportBundleToDirectory, exportContentToDirectory, FileStore } from '../electron/storage';
import { createBank, validateBundle } from '../src/domain/banks';
import { exportQuestionBankContent } from '../src/domain/questionBankPackage';

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
  function legacy() {
    const raw:any=createBank('{{旧答案}}');delete raw.format;raw.schemaVersion=raw.bank.schemaVersion=1;delete raw.bank.contentId;delete raw.bank.knowledgePoints;
    raw.bank.questions.forEach((q:any)=>{delete q.externalId;delete q.type;});return raw;
  }
  it('V1 首次读取不改文件，首次保存先逐字节保留迁移原件',async()=>{
    const raw=legacy(),bytes=Buffer.from('\n'+JSON.stringify(raw,null,4)+'\r\n'),store=new FileStore(root),id=raw.bank.id;
    await mkdir(join(root,'banks'));await writeFile(join(root,'banks',`${id}.json`),bytes);
    const b=(await store.load()).bundles[0];expect(b.schemaVersion).toBe(2);expect(await readFile(join(root,'banks',`${id}.json`))).toEqual(bytes);
    await store.save(b);expect(await readFile(join(root,'migrations',`${id}.v1.original.json`))).toEqual(bytes);
    await store.save({...b,bank:{...b.bank,name:'修改后'}});expect(await readFile(join(root,'migrations',`${id}.v1.original.json`))).toEqual(bytes);
    expect((await store.load()).bundles[0].bank.name).toBe('修改后');
  });
  it('迁移原件无法写入时停止保存，旧主文件及备份均不动',async()=>{
    const raw=legacy(),bytes=JSON.stringify(raw),id=raw.bank.id,store=new FileStore(root);await mkdir(join(root,'banks'));await writeFile(join(root,'banks',`${id}.json`),bytes);await writeFile(join(root,'migrations'),'模拟不可写目录');
    await expect(store.save(validateBundle(raw))).rejects.toThrow();expect(await readFile(join(root,'banks',`${id}.json`),'utf8')).toBe(bytes);expect(await readdir(join(root,'backups'))).toEqual([]);
  });
  it('主文件损坏且备份 V1 时，保存前归档有效旧备份',async()=>{
    const raw=legacy(),bytes=JSON.stringify(raw),id=raw.bank.id,store=new FileStore(root);await mkdir(join(root,'banks'));await mkdir(join(root,'backups'));await writeFile(join(root,'banks',`${id}.json`),'{坏');await writeFile(join(root,'backups',`${id}.json.bak`),bytes);
    const b=(await store.load()).bundles[0];await store.save(b);expect(await readFile(join(root,'migrations',`${id}.v1.original.json`),'utf8')).toBe(bytes);expect(await readFile(join(root,'backups',`${id}.json.bak`),'utf8')).toBe(bytes);expect((await readdir(join(root,'banks'))).some(x=>x.includes('.corrupt-'))).toBe(true);
  });
  it('未来版本主文件禁止退回旧备份，也禁止直接写覆盖',async()=>{
    const b=createBank('{{甲}}'),store=new FileStore(root);await store.save(b);await store.save(b);const file=join(root,'banks',`${b.bank.id}.json`),future=JSON.stringify({...b,schemaVersion:3});await writeFile(file,future);
    const result=await store.load();expect(result.bundles).toEqual([]);expect(result.warnings[0]).toContain('升级');await expect(store.save(b)).rejects.toThrow('禁止覆盖');expect(await readFile(file,'utf8')).toBe(future);
    await expect(new FileStore(root).save(b)).rejects.toThrow('高版本');expect(await readFile(file,'utf8')).toBe(future);
  });
  it('内容导出不包含学习记录，文件名安全且互不覆盖',async()=>{
    const content=exportQuestionBankContent(createBank('# 内容/示例\n{{甲}}')),directory=join(root,'exports');const a=await exportContentToDirectory(content,directory),b=await exportContentToDirectory(content,directory);expect(a.startsWith(directory+sep)).toBe(true);expect(a).toMatch(/\.questionbank\.json$/);expect(a).not.toBe(b);expect(JSON.parse(await readFile(a,'utf8'))).toEqual(content);
  });
});
