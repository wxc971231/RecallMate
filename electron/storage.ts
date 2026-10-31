import { mkdir, readFile, writeFile, rename, copyFile, readdir, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { validateBundle, validId } from '../src/domain/banks';
import type { Bundle, LoadResult } from '../src/domain/types';
import { randomUUID } from 'node:crypto';

export async function exportBundleToDirectory(input: unknown, directory: string): Promise<string> {
  const bundle = validateBundle(input);
  const name = bundle.bank.name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 60);
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${name}-${Date.now()}-${randomUUID().slice(0, 8)}.recallmate.json`);
  await writeFile(path, JSON.stringify(bundle, null, 2), { encoding: 'utf8', flag: 'wx', flush: true });
  return path;
}

export class FileStore {
  private queues = new Map<string, Promise<void>>();
  private blocked = new Set<string>();
  constructor(readonly root: string) {}
  private paths(id: string) {
    if (!validId(id)) throw new Error('无效的题库 ID');
    return { main: join(this.root, 'banks', `${id}.json`), backup: join(this.root, 'backups', `${id}.json.bak`) };
  }
  private async prepare() { await mkdir(join(this.root, 'banks'), { recursive: true }); await mkdir(join(this.root, 'backups'), { recursive: true }); }
  private async read(path: string) {
    if ((await stat(path)).size > 20 * 1024 * 1024) throw new Error('题库文件超过 20 MB');
    return validateBundle(JSON.parse(await readFile(path, 'utf8')));
  }
  async load(): Promise<LoadResult> {
    await this.prepare();
    const result: LoadResult = { bundles: [], warnings: [] };
    const files = await readdir(join(this.root, 'banks'));
    for (const file of files.filter(f => f.endsWith('.json'))) {
      const id = file.slice(0, -5);
      if (!validId(id)) continue;
      const paths = this.paths(id);
      try {
        const bundle = await this.read(paths.main);
        if (bundle.bank.id !== id) throw new Error('文件名与题库 ID 不一致');
        result.bundles.push(bundle);
      } catch {
        try {
          const bundle = await this.read(paths.backup);
          if (bundle.bank.id !== id) throw new Error('备份 ID 不一致');
          result.bundles.push(bundle);
          result.warnings.push(`“${bundle.bank.name}”的主文件损坏，已读取上一份有效备份；损坏文件会保留。`);
        } catch {
          this.blocked.add(id);
          result.warnings.push(`题库 ${id} 的主文件和备份均无法读取。原文件已保留，请从导出的 JSON 恢复为新题库，或手动修复数据目录中的文件。`);
        }
      }
    }
    return result;
  }
  private enqueue(id: string, operation: () => Promise<void>) {
    const pending = (this.queues.get(id) ?? Promise.resolve()).catch(() => {}).then(operation);
    this.queues.set(id, pending);
    return pending;
  }
  save(input: unknown): Promise<void> {
    const bundle = validateBundle(input), id = bundle.bank.id;
    const snapshot = JSON.stringify(bundle, null, 2);
    return this.enqueue(id, async () => {
      if (this.blocked.has(id)) throw new Error('该题库文件损坏，已禁止覆盖，请先修复或恢复为新题库');
      await this.prepare();
      const paths = this.paths(id);
      let exists = false;
      try { await stat(paths.main); exists = true; } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
      if (exists) {
        let valid = false;
        try { await this.read(paths.main); valid = true; } catch { /* Preserve corruption, never replace the valid backup with it. */ }
        if (valid) await copyFile(paths.main, paths.backup);
        else await copyFile(paths.main, `${paths.main}.corrupt-${Date.now()}`);
      }
      const temporary = `${paths.main}.tmp`;
      await writeFile(temporary, snapshot, { encoding: 'utf8', flush: true });
      await rename(temporary, paths.main);
    });
  }
  remove(id: string): Promise<void> {
    const paths = this.paths(id);
    return this.enqueue(id, async () => {
      for (const path of [paths.main, paths.backup, `${paths.main}.tmp`]) {
        try { await unlink(path); } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
      }
      this.blocked.delete(id);
    });
  }
  async flush() { await Promise.all(this.queues.values()); }
}
