const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { inside } = require('./release-files.cjs');
const root = path.resolve(__dirname, '..');

async function main() {
  const metadata = JSON.parse(await fs.readFile(path.join(root, 'android/app/build/outputs/apk/release/output-metadata.json'), 'utf8'));
  const version = metadata.elements[0].versionName;
  if (!/^\d+\.\d+\.\d+$/.test(version) || metadata.applicationId !== 'com.recallmate.mobile') throw new Error('Unexpected Android release metadata');
  const directory = inside(root, path.join(root, 'release/android'));
  await fs.mkdir(directory, { recursive: true });
  if ((await fs.lstat(directory)).isSymbolicLink()) throw new Error('Refusing linked Android release directory');
  inside(root, await fs.realpath(directory));
  const name = `RecallMate-Android-${version}.apk`;
  const source = inside(path.join(root, 'android/app/build/outputs/apk/release'), path.join(root, 'android/app/build/outputs/apk/release', metadata.elements[0].outputFile));
  if (!process.env.JAVA_HOME || !process.env.ANDROID_HOME) throw new Error('JAVA_HOME and ANDROID_HOME are required to verify the release signature');
  execFileSync(path.join(process.env.JAVA_HOME, 'bin/java.exe'), ['-jar', path.join(process.env.ANDROID_HOME, 'build-tools/36.0.0/lib/apksigner.jar'), 'verify', source], { windowsHide: true });
  const bytes = await fs.readFile(source);
  const entries = await fs.readdir(directory);
  for (const entry of entries) {
    if (!/^RecallMate-Android-\d+\.\d+\.\d+\.apk$/.test(entry) && !['SHA256SUMS.txt', '使用说明.txt'].includes(entry)) throw new Error('Unexpected Android release file, retained: ' + entry);
    if (!(await fs.lstat(inside(directory, path.join(directory, entry)))).isFile()) throw new Error('Unexpected release directory or link');
  }
  // Only remove older Android APK files, never desktop distributions or data.
  await fs.writeFile(inside(directory, path.join(directory, name)), bytes);
  await fs.writeFile(path.join(directory, 'SHA256SUMS.txt'), `${createHash('sha256').update(bytes).digest('hex')}  ${name}\n`);
  await fs.writeFile(path.join(directory, '使用说明.txt'), `RecallMate Android ${version}\n\n将 APK 传到安卓手机后安装，按系统提示允许对应来源安装应用。支持 Android 7.0 及以上；建议使用较新系统并保持 Android System WebView 更新。\n\n离线使用，无账号。支持填空、判断、单选、多选。导入 UTF-8 TXT/MD、.questionbank.json 内容包或 RecallMate JSON 备份。\nWindows 0.2.x 与 Android 0.2.x 可互相恢复 V2 备份、导入混合内容包。备份包含进度与统计，内容包只含题目及知识点。旧版 Android 0.1.2 无法读取新版混合备份。\n填空严格模式默认开启，可在设置中关闭；已开始题目保留原判题规则。旧数据首次保存前保留 V1 原始文件。\n题库、进度和字号保存在应用私有存储。卸载或清除应用数据前，请先导出备份。安装同一签名的新版可保留数据。\n\n本包由本地开发者密钥签名，不是 Google Play 商店安装包。\n`);
  for (const entry of entries.filter(entry => entry.endsWith('.apk') && entry !== name)) await fs.unlink(inside(directory, path.join(directory, entry)));
  console.log('Android APK: ' + path.join(directory, name));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
