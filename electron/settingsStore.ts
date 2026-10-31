import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defaultSettings, validateSettings, type AppSettings } from '../src/domain/settings';

export class SettingsStore {
  private queue = Promise.resolve();
  private readonly path: string;
  constructor(private readonly directory: string) { this.path = join(directory, 'app-settings.json'); }
  private async read(path: string) {
    if ((await stat(path)).size > 4096) throw new Error('设置文件过大');
    return validateSettings(JSON.parse(await readFile(path, 'utf8')));
  }
  async load(): Promise<{ settings: AppSettings; warning?: string }> {
    try { return { settings: await this.read(this.path) }; }
    catch (error: any) {
      if (error.code === 'ENOENT') return { settings: { ...defaultSettings } };
      try { return { settings: await this.read(`${this.path}.bak`), warning: '字号设置已从上一份备份恢复。' }; }
      catch { return { settings: { ...defaultSettings }, warning: '字号设置无法读取，暂用默认字号；原文件保留。' }; }
    }
  }
  save(input: unknown): Promise<void> {
    const serialized = JSON.stringify(validateSettings(input), null, 2);
    const task = this.queue.catch(() => {}).then(async () => {
      await mkdir(this.directory, { recursive: true });
      let exists = false;
      try { await stat(this.path); exists = true; } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
      if (exists) {
        let valid = false;
        try { await this.read(this.path); valid = true; } catch { /* Preserve the original when replacing unreadable preferences. */ }
        await copyFile(this.path, valid ? `${this.path}.bak` : `${this.path}.corrupt-${Date.now()}`);
      }
      await writeFile(`${this.path}.tmp`, serialized, { encoding: 'utf8', flush: true });
      await rename(`${this.path}.tmp`, this.path);
    });
    this.queue = task;
    return task;
  }
  async flush() { await this.queue; }
}
