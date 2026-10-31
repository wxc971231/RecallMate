import type { App } from 'electron';
import { mkdirSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export interface RuntimePaths {
  portable: boolean;
  root: string;
  data: string;
  session: string;
  temporary: string;
  logs: string;
  crashes: string;
  exports: string;
}

export function resolveRuntimePaths(options: {
  packaged: boolean; executable: string; project: string;
  developmentData?: string; testPortableRoot?: string;
}): RuntimePaths {
  // Packaged applications always keep data beside the executable. Environment
  // overrides are deliberately limited to unpackaged development/test runs.
  const portable = options.packaged || !!options.testPortableRoot;
  const root = options.packaged ? dirname(resolve(options.executable))
    : options.testPortableRoot ? resolve(options.testPortableRoot) : resolve(options.project);
  const data = portable ? join(root, 'data') : resolve(options.developmentData ?? join(root, '.cache', 'development-data'));
  return { portable, root, data, session: join(data, 'runtime'), temporary: join(data, 'temp'), logs: join(data, 'logs'), crashes: join(data, 'crashes'), exports: join(data, 'exports') };
}

export function configureRuntimePaths(application: Pick<App, 'setPath' | 'setAppLogsPath'> & { commandLine: Pick<App['commandLine'], 'appendSwitch'> }, paths: RuntimePaths): void {
  // Must run synchronously before app.ready, BrowserWindow, sessions and the
  // single-instance lock; changing only userData leaves other writable paths behind.
  for (const directory of [paths.data, paths.session, paths.temporary, paths.logs, paths.crashes, paths.exports]) mkdirSync(directory, { recursive: true });
  const probe = join(paths.data, `.write-check-${process.pid}`);
  const descriptor = openSync(probe, 'wx'); closeSync(descriptor); unlinkSync(probe);
  application.setPath('appData', paths.data);
  application.setPath('userData', paths.data);
  application.setPath('sessionData', paths.session);
  application.setPath('temp', paths.temporary);
  application.setPath('crashDumps', paths.crashes);
  application.setAppLogsPath(paths.logs);
  application.commandLine.appendSwitch('disk-cache-dir', join(paths.session, 'Cache'));
  application.commandLine.appendSwitch('log-file', join(paths.logs, 'chromium.log'));
  process.env.TEMP = paths.temporary;
  process.env.TMP = paths.temporary;
  process.env.TMPDIR = paths.temporary;
  process.env.CHROME_LOG_FILE = join(paths.logs, 'chromium.log');
}
