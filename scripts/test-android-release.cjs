// Final signed APK smoke test through Android accessibility and native taps.
// Must run on the dedicated disposable emulator; never clears release data.
const fs = require('node:fs/promises');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), serial = process.env.RECALLMATE_ANDROID_SERIAL || 'emulator-5580';
if (!/^emulator-\d+$/.test(serial)) throw new Error('A dedicated disposable emulator is required.');
const adbPath = path.join(process.env.ANDROID_HOME, 'platform-tools/adb.exe');
const version = readFileSync(path.join(root,'android/app/build.gradle'),'utf8').match(/versionName\s+"([^"]+)"/)[1];
const pkg = 'com.recallmate.mobile', apk = path.join(root, `release/android/RecallMate-Android-${version}.apk`);
const adb = (...args) => execFileSync(adbPath, ['-s',serial,...args], { encoding:'utf8', timeout:30000, windowsHide:true }).trim();
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
const out = path.join(root,'artifacts/android');
let checks = 0;
const check = (value,label) => { assert.ok(value,label); console.log('PASS',label); checks++; };
async function nodes() {
  adb('shell','rm','-f','/sdcard/recallmate-release-ui.xml');
  try { adb('shell','uiautomator','dump','--compressed','/sdcard/recallmate-release-ui.xml'); }
  catch (error) { if (error.status !== 137 || !String(error.stdout).includes('dumped to:')) throw error; }
  const xml = adb('shell','cat','/sdcard/recallmate-release-ui.xml');
  return [...xml.matchAll(/<node\b[^>]*>/g)].map(item=>Object.fromEntries([...item[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]])));
}
async function waitFor(text) {
  for (let i=0;i<8;i++) { const all=await nodes(); if (all.map(n=>n.text||'').join('').includes(text) || all.some(n=>n.hint===text || n['content-desc']===text)) return all; await delay(300); }
  throw new Error('Timed out waiting for release screen: '+text);
}
async function tap(text) {
  for(let i=0;i<7;i++) {
    const all=await nodes(), node=all.find(n=>n.text===text||n['content-desc']===text);
    if(node) {
      const b=node.bounds.match(/\d+/g).map(Number);
      if(b[2]>b[0] && b[3]>b[1] && b[1]<2300) { adb('shell','input','tap',String(Math.round((b[0]+b[2])/2)),String(Math.round((b[1]+b[3])/2))); await delay(450); return; }
      adb('shell','input','swipe','540','1950','540','650','400');
    }
    await delay(300);
  }
  throw new Error('Release control unavailable: '+text);
}
async function shot(name) { await fs.writeFile(path.join(out,name),execFileSync(adbPath,['-s',serial,'exec-out','screencap','-p'],{windowsHide:true})); }
async function main() {
  await fs.mkdir(out,{recursive:true});
  adb('install','-r',process.env.RECALLMATE_PREVIOUS_APK || apk); adb('shell','svc','wifi','disable'); adb('shell','svc','data','disable');
  adb('shell','am','force-stop',pkg); adb('shell','am','start','-W','-n',pkg+'/com.recallmate.mobile.MainActivity');
  const initial=await waitFor('搜索题库'); check(true,'Signed release opens offline without a server');
  await shot('release-home.png');
  if(initial.some(n=>n.text==='暂无题库')) {
    await tap('体验示例题库'); await tap('导入 20 道题目');
    await waitFor('开始练习'); check(true,'Signed release imports a bank through real touch input while offline');
    await tap('开始练习');
  } else {
    assert.ok(process.argv.includes('--reuse-test-bank'),'Existing release data: use a fresh disposable emulator, or explicitly reuse the previously created test bank.');
    await tap('记忆热身 · 综合知识'); await tap('选择练习模式'); await tap('新建顺序练习'); await tap('开始新练习');
    check(true,'Previously imported release test bank remains readable while offline');
  }
  await tap('跳过'); await tap('放弃');
  await waitFor('已补全答案'); await tap('下一题'); await waitFor('第 3 题');
  await shot('release-practice.png');
  const pid=adb('shell','pidof',pkg).split(' ')[0];
  check(!adb('shell','cat','/proc/net/unix').includes('webview_devtools_remote_'+pid),'Release APK disables WebView debugging');
  adb('shell','am','force-stop',pkg); adb('install','-r',apk);
  adb('shell','am','start','-W','-n',pkg+'/com.recallmate.mobile.MainActivity');
  await waitFor('继续练习'); await tap('记忆热身 · 综合知识'); await tap('继续练习');
  await waitFor('第 3 题'); check(true,'Reinstalling a signed update preserves bank and practice position');
  await shot('release-update-restored.png');
  await fs.writeFile(path.join(out,'release-result.json'),JSON.stringify({passed:true,checks,serial,packageId:pkg},null,2));
}
main().catch(async e=>{console.error(e);try{await shot('release-failure.png')}catch{}process.exitCode=1});
