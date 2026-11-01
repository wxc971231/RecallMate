import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
const { inside, managedName, inspectRelease, backupReleaseData, removeReleaseEntries } = createRequire(import.meta.url)('../scripts/release-files.cjs');
let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'recallmate-release-test-')); await mkdir(join(root, 'release')); });
afterEach(async () => { if (!resolve(root).startsWith(resolve(tmpdir()) + sep) || !root.split(sep).at(-1)!.startsWith('recallmate-release-test-')) throw new Error('Unexpected cleanup path'); await rm(root, { recursive: true, force: true }); });
describe('发布目录清理', () => {
  it('只识别已知发布产物，不将普通笔记当成安装包', () => {
    for (const name of ['RecallMate-0.1.0-Setup.exe', 'RecallMate-0.1.0-Setup.exe.blockmap', 'RecallMate-0.1.1-Portable', 'RecallMate-0.1.2-Portable.zip', 'RecallMate-0.1.1-SHA256SUMS.txt', 'latest.yml', 'win-unpacked', 'SHA256SUMS.txt']) expect(managedName(name)).toBe(true);
    for (const name of ['notes.md', 'RecallMate-important-data.json', '../outside', 'data']) expect(managedName(name)).toBe(false);
  });
  it('拒绝释放目录外的绝对路径及父目录', () => {
    const release = join(root, 'release'); expect(() => inside(release, root)).toThrow(); expect(() => inside(release, join(root, 'release-other'))).toThrow();
    expect(inside(release, join(release, 'RecallMate-0.1.2-Portable'))).toBe(join(release, 'RecallMate-0.1.2-Portable'));
  });
  it('未知文件会让清理停止，原文件保持不变', async () => {
    const release = join(root, 'release'); await writeFile(join(release, 'notes.md'), 'retain');
    await expect(inspectRelease(root, release)).rejects.toThrow('Unrecognized'); expect(await readFile(join(release, 'notes.md'), 'utf8')).toBe('retain');
  });
  it('重新发布 Windows 版时保留独立的 Android 发布目录', async () => {
    const release = join(root, 'release'); await mkdir(join(release, 'android'));
    await writeFile(join(release, 'android', 'RecallMate-Android-0.1.0.apk'), 'android');
    await writeFile(join(release, 'RecallMate-0.1.4-Portable.zip'), 'windows');
    const entries = await inspectRelease(root, release); expect(entries.map((e: { name: string }) => e.name)).toEqual(['RecallMate-0.1.4-Portable.zip']);
    await removeReleaseEntries(release, entries);
    expect(await readFile(join(release, 'android', 'RecallMate-Android-0.1.0.apk'), 'utf8')).toBe('android');
  });
  it('删除旧版本之前完整备份 data，清理后题库仍可恢复', async () => {
    const release = join(root, 'release'), bank = join(release, 'RecallMate-0.1.1-Portable', 'data', 'banks');
    await mkdir(bank, { recursive: true }); await writeFile(join(bank, 'bank.json'), 'preserved bank');
    const entries = await inspectRelease(root, release), backups = await backupReleaseData(root, release, entries);
    expect(backups).toHaveLength(1); expect(backups[0].to.startsWith(join(root, '.cache', 'release-data-backups') + sep)).toBe(true);
    await removeReleaseEntries(release, entries);
    expect(await readdir(release)).toEqual([]); expect(await readFile(join(backups[0].to, 'banks', 'bank.json'), 'utf8')).toBe('preserved bank');
  });
});
