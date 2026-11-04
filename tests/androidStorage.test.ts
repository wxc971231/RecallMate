import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBank } from '../src/domain/banks';
import { defaultSettings } from '../src/domain/settings';
import { createAndroidStorage } from '../src/services/androidStorage';
import { startSession, practiceAction } from '../src/domain/practice';
import { exportQuestionBankContent } from '../src/domain/questionBankPackage';

vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));

const bank = () => createBank('# 测试\n题目{{答案}}');
const native = () => ({
  list: vi.fn().mockResolvedValue({ records: [], warnings: [] }),
  readSettings: vi.fn().mockResolvedValue({}), write: vi.fn().mockResolvedValue({}),
  writeSettings: vi.fn().mockResolvedValue({}), remove: vi.fn().mockResolvedValue({}),
  chooseFile: vi.fn().mockResolvedValue({ cancelled: true }), exportFile: vi.fn().mockResolvedValue({ saved: true }),
});
let files: ReturnType<typeof native>;
beforeEach(() => { files = native(); });

describe('安卓存储适配与跨平台备份', () => {
  it('读取 Windows 格式的题库，保存时保留已验证的旧快照', async () => {
    const bundle = bank(), text = JSON.stringify(bundle);
    files.list.mockResolvedValue({ records: [{ id: bundle.bank.id, main: text }], warnings: [] });
    const storage = createAndroidStorage(files);
    expect((await storage.load()).bundles).toEqual([bundle]);
    bundle.bank.name = '更新'; await storage.save(bundle);
    expect(files.write).toHaveBeenCalledWith({ id: bundle.bank.id, text: JSON.stringify(bundle), previous: text, preserve: false });
  });
  it('主文件 JSON 合法但会话结构损坏时，仍回退到有效备份', async () => {
    const bundle = bank(), backup = JSON.stringify(bundle);
    files.list.mockResolvedValue({ records: [{ id: bundle.bank.id, main: JSON.stringify({ ...bundle, session: {} }), backup }], warnings: [] });
    const storage = createAndroidStorage(files), result = await storage.load();
    expect(result.bundles).toEqual([bundle]); expect(result.warnings[0]).toContain('有效备份');
    await storage.save(bundle);
    expect(files.write.mock.calls[0][0]).toMatchObject({ previous: backup, preserve: true });
  });
  it('文件名和题库 ID 不一致时不接受主文件', async () => {
    const bundle = bank(), other = bank();
    files.list.mockResolvedValue({ records: [{ id: bundle.bank.id, main: JSON.stringify(other) }], warnings: [] });
    const result = await createAndroidStorage(files).load();
    expect(result.bundles).toEqual([]); expect(result.warnings).toHaveLength(1);
  });
  it('恢复外部 JSON 时保留无法读取的原文件', async () => {
    const bundle = bank();
    files.list.mockResolvedValue({ records: [{ id: bundle.bank.id, main: 'bad', backup: 'bad' }], warnings: [] });
    const storage = createAndroidStorage(files); await storage.load(); await storage.save(bundle);
    expect(files.write.mock.calls[0][0].preserve).toBe(true);
  });
  it('写入失败不推进上一份有效快照', async () => {
    const storage = createAndroidStorage(files), bundle = bank(); await storage.save(bundle);
    const first = JSON.stringify(bundle); bundle.bank.name = '第二份';
    files.write.mockRejectedValueOnce(new Error('磁盘写入失败'));
    await expect(storage.save(bundle)).rejects.toThrow('磁盘');
    await storage.save(bundle); expect(files.write.mock.calls[2][0].previous).toBe(first);
  });
  it('拒绝越界题库标识及结构无效的保存', async () => {
    const storage = createAndroidStorage(files);
    await expect(storage.remove('../settings')).rejects.toThrow('无效');
    await expect(storage.save({} as never)).rejects.toThrow();
    expect(files.remove).not.toHaveBeenCalled(); expect(files.write).not.toHaveBeenCalled();
  });
  it('字号默认值、损坏恢复和后续备份一致', async () => {
    const settings = { ...defaultSettings, practiceFontSize: 32 }, backup = JSON.stringify(settings);
    files.readSettings.mockResolvedValue({ main: 'bad', backup });
    const storage = createAndroidStorage(files);
    expect((await storage.loadSettings()).settings).toEqual(settings);
    await storage.saveSettings({ ...settings, uiFontSize: 16 });
    expect(files.writeSettings.mock.calls[0][0]).toMatchObject({ previous: backup, preserve: true });
  });
  it('新安装时使用默认字号', async () => expect((await createAndroidStorage(files).loadSettings()).settings).toEqual(defaultSettings));
  it('取消文件选择不会创建题库，UTF-8 BOM 会被去除', async () => {
    const storage = createAndroidStorage(files); expect(await storage.chooseFile()).toBeNull();
    files.chooseFile.mockResolvedValue({ name: '题目.md', text: '\uFEFF题目{{答案}}' });
    expect(await storage.chooseFile()).toEqual({ name: '题目.md', text: '题目{{答案}}' });
  });
  it('导出包含原有统计和进度，取消保存不报告成功', async () => {
    const bundle = bank(); bundle.bank.name = '带/斜杠的题库';
    const storage = createAndroidStorage(files); expect(await storage.exportFile(bundle)).toBe(true);
    const options = files.exportFile.mock.calls[0][0];
    expect(options.name).toBe('带_斜杠的题库.recallmate.json'); expect(JSON.parse(options.text)).toEqual(bundle);
    files.exportFile.mockResolvedValue({ saved: false }); expect(await storage.exportFile(bundle)).toBe(false);
  });
  function legacy() {
    let b=startSession(bank(),'all');b=practiceAction(b,{type:'edit',index:0,value:'答'});b=practiceAction(b,{type:'submit'});
    const raw:any=structuredClone(b);delete raw.format;raw.schemaVersion=raw.bank.schemaVersion=raw.session.schemaVersion=1;
    delete raw.bank.contentId;delete raw.bank.knowledgePoints;raw.bank.questions.forEach((q:any)=>{delete q.type;delete q.externalId;});delete raw.session.currentAttempt.questionType;return raw;
  }
  it('V1 保留草稿、统计、旧规则，首次写入要求原生先归档原始文本',async()=>{
    const raw=legacy(),text='\r\n'+JSON.stringify(raw,null,4)+'\r\n';files.list.mockResolvedValue({records:[{id:raw.bank.id,main:text}],warnings:[]});
    const store=createAndroidStorage(files),b=(await store.load()).bundles[0];expect(b.schemaVersion).toBe(2);expect(b.bank.stats).toEqual(raw.bank.stats);expect(b.session!.currentAttempt).toMatchObject({...JSON.parse(JSON.stringify(raw.session.currentAttempt)),questionType:'cloze'});
    expect(b.session!.currentAttempt).not.toHaveProperty('strictBlankOrder');await store.save(b);expect(files.write.mock.calls[0][0]).toMatchObject({legacyOriginal:text,previous:text,preserve:false});
    await store.save(b);expect(files.write.mock.calls[1][0]).not.toHaveProperty('legacyOriginal');
  });
  it('迁移归档失败不推进快照，重试仍携带完整 V1 原文',async()=>{
    const raw=legacy(),text=JSON.stringify(raw);files.list.mockResolvedValue({records:[{id:raw.bank.id,main:text}],warnings:[]});const store=createAndroidStorage(files),b=(await store.load()).bundles[0];
    files.write.mockRejectedValueOnce(new Error('原件归档失败'));await expect(store.save(b)).rejects.toThrow('归档');await store.save(b);
    expect(files.write.mock.calls[1][0]).toMatchObject({legacyOriginal:text,previous:text});
  });
  it('损坏主文件恢复 V1 备份时，归档的原文来自有效备份',async()=>{
    const raw=legacy(),text=JSON.stringify(raw,null,2);files.list.mockResolvedValue({records:[{id:raw.bank.id,main:'broken',backup:text}],warnings:[]});const store=createAndroidStorage(files),b=(await store.load()).bundles[0];await store.save(b);
    expect(files.write.mock.calls[0][0]).toMatchObject({legacyOriginal:text,previous:text,preserve:true});
  });
  it('未来主版本不退回旧备份，且禁止写入覆盖',async()=>{
    const b=bank();files.list.mockResolvedValue({records:[{id:b.bank.id,main:JSON.stringify({...b,schemaVersion:3}),backup:JSON.stringify(b)}],warnings:[]});const store=createAndroidStorage(files),result=await store.load();
    expect(result.bundles).toEqual([]);expect(result.warnings[0]).toContain('不支持');await expect(store.save(b)).rejects.toThrow('禁止覆盖');expect(files.write).not.toHaveBeenCalled();
  });
  it('混合的未来子版本也禁止回退和覆盖',async()=>{
    const b=bank();files.list.mockResolvedValue({records:[{id:b.bank.id,main:JSON.stringify({...b,schemaVersion:1,bank:{...b.bank,schemaVersion:3}}),backup:JSON.stringify(b)}],warnings:[]});const store=createAndroidStorage(files);expect((await store.load()).bundles).toHaveLength(0);await expect(store.save(b)).rejects.toThrow('禁止覆盖');
  });
  it('原生内容导出只含题库内容，不包含学习记录',async()=>{
    const b=startSession(bank(),'all'),content=exportQuestionBankContent(b);const store=createAndroidStorage(files);await store.exportContent(content);const output=JSON.parse(files.exportFile.mock.calls[0][0].text);
    expect(output.format).toBe('recallmate.question-bank');expect(output).not.toHaveProperty('session');expect(output.bank).not.toHaveProperty('stats');
  });
});
