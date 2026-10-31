const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { createReadStream } = require('node:fs');
const { version, build } = require('../package.json');
const { inside, inspectRelease, backupReleaseData, removeReleaseEntries } = require('./release-files.cjs');
const root = path.resolve(__dirname, '..');
const release = path.join(root, 'release');
const name = `RecallMate-${version}-Portable`;

async function main() {
  const unpacked = inside(root, path.resolve(root, build.directories.output, 'win-unpacked'));
  await fs.access(path.join(unpacked, 'RecallMate.exe'));
  await fs.mkdir(release, { recursive: true });
  const entries = await inspectRelease(root, release);
  // Do not replace an application that is currently using its release data.
  await new Promise((resolve, reject) => {
    const script = "$ErrorActionPreference='Stop'; $items=@(Get-Process -Name RecallMate -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path); ConvertTo-Json -InputObject $items -Compress";
    const child = spawn('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true });
    let output = '', errors = '';
    child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { errors += chunk; });
    child.on('error', reject); child.on('exit', code => {
      if (code !== 0) return reject(new Error(errors || 'Cannot check running release applications'));
      try {
        const paths = JSON.parse(output || '[]');
        const boundary = release.toLowerCase() + path.sep;
        if (paths.some(item => typeof item === 'string' && path.resolve(item).toLowerCase().startsWith(boundary))) return reject(new Error('请先关闭 release 文件夹中的 RecallMate，再重新发布。'));
        resolve();
      } catch (error) { reject(error); }
    });
  });
  const cache = path.join(root, '.cache');
  await fs.mkdir(cache, { recursive: true });
  const staging = await fs.mkdtemp(path.join(cache, 'portable-package-'));
  const cleanFolder = path.join(staging, name);
  await fs.cp(unpacked, cleanFolder, { recursive: true });
  for (const directory of ['banks', 'backups', 'runtime', 'temp', 'logs', 'crashes', 'exports']) await fs.mkdir(path.join(cleanFolder, 'data', directory), { recursive: true });
  await fs.writeFile(path.join(cleanFolder, '使用说明.txt'), `RecallMate ${version} 文件夹便携版\r\n\r\n双击 RecallMate.exe 启动。请保留整个文件夹，不要只复制 EXE。\r\n\r\n题库、进度和自动备份：data\\banks 与 data\\backups\r\n运行缓存：data\\runtime\r\n临时文件：data\\temp\r\n日志与崩溃转储：data\\logs 与 data\\crashes\r\n导出的 JSON 备份：data\\exports\r\n\r\n移动或备份软件时，请先关闭，再复制整个文件夹。不要将 data 文件夹删除。\r\n文件夹不可写时会提示并退出，不会回退到 AppData。\r\n\r\n0.1.0 旧版数据不会被自动读取或删除。需要时可将旧目录的 banks、backups 复制到 data 中。\r\n\r\n本软件管理的数据写入上述文件夹；Windows、驱动、杀毒软件与原生文件对话框可能维护各自的系统记录，应用无法承诺系统级零痕迹。\r\n`, 'utf8');
  // Build the complete clean archive before touching any existing release files.
  const zipper = path.join(__dirname, 'zip-folder.ps1');
  const archive = path.join(staging, `${name}.zip`);
  await new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', zipper, '-Source', cleanFolder, '-Destination', archive], { stdio: 'inherit', windowsHide: true });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`ZIP creation failed: ${code}`)));
  });
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(archive)) digest.update(chunk);
  const checksum = `${digest.digest('hex')}  ${name}.zip\r\n`;
  // Personal data is archived outside release before any old directory is removed.
  const backups = await backupReleaseData(root, release, entries);
  for (const backup of backups) console.log(`Data backup: ${backup.to}`);
  await removeReleaseEntries(release, entries);
  await fs.cp(cleanFolder, inside(release, path.join(release, name)), { recursive: true, force: false, errorOnExist: true });
  await fs.copyFile(archive, inside(release, path.join(release, `${name}.zip`)));
  await fs.writeFile(inside(release, path.join(release, 'SHA256SUMS.txt')), checksum, 'utf8');
  const checked = path.resolve(staging);
  if (!checked.startsWith(path.resolve(cache) + path.sep) || !path.basename(checked).startsWith('portable-package-')) throw new Error('Refusing to clean unexpected staging directory');
  await fs.rm(checked, { recursive: true, force: true });
  console.log(`Folder: ${path.join(release, name)}`);
  console.log(`Clean distribution archive: ${path.join(release, `${name}.zip`)}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
