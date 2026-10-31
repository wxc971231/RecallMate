import { describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, dirname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { configureRuntimePaths, resolveRuntimePaths } from '../electron/runtimePaths';

describe('便携版路径', () => {
  it('所有打包后的数据路径都在 EXE 所在文件夹内', () => {
    const root = resolve('artifacts/portable-path-test');
    const paths = resolveRuntimePaths({ packaged: true, executable: join(root, 'RecallMate.exe'), project: resolve('.'), developmentData: resolve('outside'), testPortableRoot: resolve('also-outside') });
    expect(paths.portable).toBe(true); expect(paths.root).toBe(root);
    for (const [key, value] of Object.entries(paths)) if (key !== 'portable' && key !== 'root') expect(String(value).startsWith(root + sep)).toBe(true);
    expect(paths.data).toBe(join(root, 'data'));
  });
  it('移动整个文件夹后自动使用新位置，不记住旧绝对路径', () => {
    const a = resolveRuntimePaths({ packaged: true, executable: resolve('artifacts/A/RecallMate.exe'), project: '.' });
    const b = resolveRuntimePaths({ packaged: true, executable: resolve('artifacts/B/RecallMate.exe'), project: '.' });
    expect(b.data).toBe(join(dirname(resolve('artifacts/B/RecallMate.exe')), 'data')); expect(a.data).not.toBe(b.data);
  });
  it('开发版默认使用项目缓存，不污染用户 AppData', () => {
    const paths = resolveRuntimePaths({ packaged: false, executable: 'ignored.exe', project: resolve('.') });
    expect(paths.data).toBe(resolve('.cache/development-data')); expect(paths.portable).toBe(false);
  });
  it('在 ready 之前同时重定向配置、会话、临时、日志和转储', () => {
    const original = { TEMP: process.env.TEMP, TMP: process.env.TMP, TMPDIR: process.env.TMPDIR, CHROME_LOG_FILE: process.env.CHROME_LOG_FILE };
    const tempParent = resolve(tmpdir()), directory = mkdtempSync(join(tempParent, 'recallmate-path-test-'));
    try {
      const paths = resolveRuntimePaths({ packaged: true, executable: join(directory, 'RecallMate.exe'), project: '.' });
      const app = { setPath: vi.fn(), setAppLogsPath: vi.fn(), commandLine: { appendSwitch: vi.fn() } };
      configureRuntimePaths(app, paths);
      expect(app.setPath.mock.calls).toEqual([['appData', paths.data], ['userData', paths.data], ['sessionData', paths.session], ['temp', paths.temporary], ['crashDumps', paths.crashes]]);
      expect(app.setAppLogsPath).toHaveBeenCalledWith(paths.logs);
      expect(process.env.TEMP).toBe(paths.temporary); expect(process.env.TMP).toBe(paths.temporary);
      expect(existsSync(paths.exports)).toBe(true); expect(existsSync(join(paths.data, `.write-check-${process.pid}`))).toBe(false);
    } finally {
      for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
      if (!resolve(directory).startsWith(tempParent + sep) || !dirname(directory).startsWith(tempParent)) throw new Error('Unexpected test directory');
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
