// Runs against an isolated emulator and the .dev app, never a physical phone
// or the user's release installation. Uses the real Android bridge and files.
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const serial = process.env.RECALLMATE_ANDROID_SERIAL || 'emulator-5580';
if (!/^emulator-\d+$/.test(serial)) throw new Error('Android smoke tests require an isolated emulator.');
const adbPath = path.join(process.env.ANDROID_HOME || '', 'platform-tools', 'adb.exe');
const packageId = 'com.recallmate.mobile.dev';
const artifact = path.join(root, 'artifacts/android');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const adb = (...args) => execFileSync(adbPath, ['-s', serial, ...args], { encoding: 'utf8', windowsHide: true, timeout: 30000 }).trim();
let socket, seq = 0, checks = 0;
const pending = new Map(), errors = [];
function check(value, message) { assert.ok(value, message); checks++; console.log('PASS', message); }
async function connect() {
  const pid = adb('shell', 'pidof', packageId).split(' ')[0];
  assert.match(pid, /^\d+$/);
  adb('forward', 'tcp:9223', `localabstract:webview_devtools_remote_${pid}`);
  let tabs;
  for (let i = 0; i < 60; i++) {
    try { tabs = await (await fetch('http://127.0.0.1:9223/json/list')).json(); if (tabs[0]?.webSocketDebuggerUrl) break; } catch {}
    await pause(250);
  }
  assert.ok(tabs?.[0]?.webSocketDebuggerUrl, 'Debug WebView available');
  socket = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const item = pending.get(message.id); if (!item) return;
      pending.delete(message.id); clearTimeout(item.timer);
      message.error ? item.reject(new Error(JSON.stringify(message.error))) : item.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  });
  await command('Runtime.enable'); await command('Page.enable');
}
function command(method, params = {}) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Debug WebView is not connected'));
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 12000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function until(expression, label) {
  for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await pause(100); }
  throw new Error('Timeout: ' + label);
}
async function click(label) {
  const result = await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(e=>e.innerText.trim()===${JSON.stringify(label)} || e.getAttribute('aria-label')===${JSON.stringify(label)}); if(!b || b.disabled) return false; b.click(); return true; })()`);
  assert.ok(result, 'Button available: ' + label); await pause(300);
}
async function fill(selector, value) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
  await pause(100);
  const point = await evaluate(`(() => { const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:Math.round((r.x+r.width/2)*devicePixelRatio),y:Math.round((r.y+r.height/2)*devicePixelRatio)}; })()`);
  adb('shell', 'input', 'tap', String(point.x), String(point.y)); await pause(350);
  await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); e.focus(); e.select(); })()`);
  await pause(80); await command('Input.insertText', { text: value }); await pause(180);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)}).value`), value);
}
async function screenshot(name) {
  const result = await command('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(path.join(artifact, name), Buffer.from(result.data, 'base64'));
}
async function saved() { await until('document.querySelector(".save-indicator").textContent.includes("已保存")', 'all data saved'); }
async function records() { return evaluate('window.Capacitor.nativePromise("RecallMateFiles", "list", {})'); }
async function nativeUi() {
  adb('shell', 'uiautomator', 'dump', '--compressed', '/sdcard/recallmate-test-ui.xml');
  return adb('shell', 'cat', '/sdcard/recallmate-test-ui.xml');
}
async function nativeTap(predicate, label) {
  const xml = await nativeUi();
  const nodes = [...xml.matchAll(/<node\b[^>]*>/g)].map(match => Object.fromEntries([...match[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(item=>[item[1],item[2]])));
  const node = nodes.find(predicate);
  if (!node) { await fs.writeFile(path.join(artifact, 'native-picker.xml'), xml); throw new Error('System control not found: ' + label); }
  const bounds = node.bounds.match(/\d+/g).map(Number);
  adb('shell', 'input', 'tap', String(Math.round((bounds[0]+bounds[2])/2)), String(Math.round((bounds[1]+bounds[3])/2)));
  await pause(500);
}

async function main() {
  await fs.mkdir(artifact, { recursive: true });
  assert.equal(adb('get-state'), 'device');
  adb('install', '-r', path.join(root, 'android/app/build/outputs/apk/debug/app-debug.apk'));
  adb('shell', 'pm', 'clear', packageId);
  // Package-data-cleared broadcasts are asynchronous on recent Android builds.
  await pause(1000);
  adb('shell', 'am', 'start', '-W', '-n', `${packageId}/com.recallmate.mobile.MainActivity`);
  await connect(); await until('document.querySelector(".first-bank") !== null', 'new-install home');
  check(await evaluate('window.Capacitor.getPlatform()==="android" && !!document.querySelector(".native-app") && !document.querySelector(".preview-badge")'), 'Native Android adapter and mobile layout are active');
  check(await evaluate('(async()=>{try{await window.Capacitor.nativePromise("RecallMateFiles","remove",{id:"../settings"});return false}catch{return true}})()'), 'Native filesystem bridge rejects path traversal identifiers');
  await screenshot('01-home.png');
  await click('体验示例题库'); await click('导入 20 道题目'); await saved();
  check((await records()).records.length === 1, 'Import writes a real private JSON bank');
  check(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Phone detail page has no horizontal overflow');
  await screenshot('02-bank.png');
  await click('开始练习');
  await fill('input[aria-label="第 1 个填空"]', '叶错体'); await click('确认答案');
  check(await evaluate('document.querySelectorAll(".judge-correct").length===2 && document.querySelectorAll(".judge-incorrect").length===1'), 'Phone feedback highlights correct and wrong characters separately');
  await screenshot('03-practice-keyboard.png');
  check(await evaluate('(() => {const r=document.querySelector(".submit-button").getBoundingClientRect();return r.bottom <= innerHeight+1 && r.top>=0})()'), 'Submit action stays inside the keyboard-resized viewport');
  await click('提示');
  check(await evaluate('document.querySelector(".blank-wrap input").value === "叶绿体"'), 'Native phone hint preserves correct parts and supplies one character');
  await click('确认答案'); await click('下一题');
  await fill('input[aria-label="第 1 个填空"]', 'H2O');
  // Background immediately, before the 400 ms draft debounce expires.
  adb('shell', 'input', 'keyevent', 'KEYCODE_HOME'); await pause(700);
  const beforeRestart = (await records()).records[0];
  check(JSON.parse(beforeRestart.main).session.currentAttempt.blanks[0].value === 'H2O', 'Background transition flushes a pending draft');
  socket.close(); adb('shell', 'am', 'force-stop', packageId);
  adb('shell', 'am', 'start', '-W', '-n', `${packageId}/com.recallmate.mobile.MainActivity`);
  await connect(); await until('document.querySelector(".bank-row") !== null', 'restart home');
  await click('记忆热身 · 综合知识'); await click('继续练习');
  check(await evaluate('document.querySelector(".blank-wrap input").value === "H2O"'), 'App restart restores the saved answer and current question');
  await click('确认答案'); await click('下一题'); await click('放弃');
  check(await evaluate('document.querySelectorAll(".source-give_up").length>0'), 'Giving up marks system-supplied characters');
  await click('下一题'); await saved();
  // A hardware back event goes to detail, then home; it must not exit early.
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); await pause(300);
  if (await evaluate('!!document.querySelector(".practice-page")')) { adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); await pause(300); }
  await until('document.querySelector(".detail-heading") !== null', 'hardware back to bank');
  check(true, 'Android back returns from practice without losing the session');
  await click('字号');
  await evaluate(`(() => { const e=document.querySelector('input[aria-label="练习字号"]'); const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(e,'32'); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await click('关闭字号设置'); await saved();
  check(await evaluate('getComputedStyle(document.documentElement).getPropertyValue("--practice-font-size").trim()==="32px"'), 'Mobile practice font can be adjusted and saved');
  // System picker cancellation must resolve cleanly, without adding a bank.
  await click('设置'); await click('从 JSON 恢复'); await pause(700);
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); await pause(400);
  check((await records()).records.length === 1, 'Cancelling the real Android file picker retains existing data');
  await saved();
  const bank = JSON.parse((await records()).records[0].main);
  check(Object.values(bank.bank.stats).reduce((sum, item)=>sum+item.wrongAttemptCount,0)===1, 'Partial submissions retain once-per-attempt statistics on Android');
  check((await records()).records[0].backup !== undefined, 'Previous validated bank snapshot is present as a backup');
  await screenshot('04-resumed.png');
  const exportPath = '/sdcard/Download/' + bank.bank.name + '.recallmate.json';
  adb('shell', 'rm', '-f', "'" + exportPath.replaceAll("'", "'\\''") + "'");
  await click('导出备份'); await pause(500);
  await nativeTap(node => /save/i.test(node['resource-id'] || '') && node.clickable === 'true' || /^save$/i.test(node.text || ''), 'Save exported JSON');
  await until('document.querySelector(".toast")?.textContent.includes("备份已保存")', 'system export saved');
  // The Android shell joins arguments: quote the user-facing filename safely.
  const exportedText = adb('shell', 'cat', "'" + exportPath.replaceAll("'", "'\\''") + "'");
  check(JSON.parse(exportedText).bank.id === bank.bank.id, 'System save picker exports a complete Windows-compatible JSON backup');
  const importPath = path.join(artifact, 'RecallMate-Android-Test.md');
  await fs.writeFile(importPath, '# 安卓并列测试\n{{a}}、{{b}}、{{c}} 和 {{d}}。\n---\n{{甲和乙}}。');
  adb('push', importPath, '/sdcard/Download/RecallMate-Android-Test.md');
  await click('设置'); await click('从 JSON 恢复'); await pause(500);
  // The picker can start in Recent or Downloads. Open Downloads via its drawer.
  let picker = await nativeUi();
  if (!picker.includes('text="RecallMate-Android-Test.md"')) {
    await nativeTap(node => /Show roots|Open navigation drawer/i.test(node['content-desc'] || ''), 'Open file locations');
    await nativeTap(node => /^Downloads$/i.test(node.text || ''), 'Downloads');
  }
  await nativeTap(node => node.text === 'RecallMate-Android-Test.md', 'Imported Markdown');
  await until('document.querySelector("#import-text")?.value.includes("安卓并列测试")', 'UTF-8 file import preview');
  await click('导入 2 道题目'); await click('开始练习');
  for (const [index,value] of ['d','a','c','b'].entries()) { await fill(`input[aria-label="第 ${index+1} 个填空"]`, value); await click('确认答案'); }
  check(await evaluate('document.querySelector(".question-feedback").textContent.includes("全部答对")'), 'Mixed enumeration and conjunction accept arbitrary order across four mobile blanks');
  await click('下一题'); await fill('input[aria-label="第 1 个填空"]','乙和甲'); await click('确认答案');
  check(await evaluate('document.querySelector(".question-feedback").textContent.includes("全部答对")'), 'Single-blank conjunction accepts exchanged answers on Android');
  await screenshot('05-mixed-answers.png'); await saved();
  socket.close(); adb('shell','am','force-stop',packageId); adb('shell','am','start','-W','-n',`${packageId}/com.recallmate.mobile.MainActivity`);
  await connect(); await until('document.querySelectorAll(".bank-row").length===2','both banks restored');
  check(await evaluate('getComputedStyle(document.documentElement).getPropertyValue("--practice-font-size").trim()==="32px"'), 'Font settings and imported banks survive a second app restart');
  const recoveredId = bank.bank.id;
  assert.match(recoveredId,/^[0-9a-f-]{36}$/i);
  socket.close(); adb('shell','am','force-stop',packageId);
  adb('shell','run-as',packageId,'sh','-c',`'printf broken > files/recallmate/banks/${recoveredId}.json'`);
  adb('shell','am','start','-W','-n',`${packageId}/com.recallmate.mobile.MainActivity`);
  await connect(); await until('document.querySelectorAll(".bank-row").length===2','native backup recovery');
  check(await evaluate('document.querySelector(".warning-banner").textContent.includes("有效备份")'), 'A corrupted private bank recovers from its last validated native backup');
  check(errors.length === 0, 'No uncaught WebView errors during the native workflow');
  await fs.writeFile(path.join(artifact, 'smoke-result.json'), JSON.stringify({ passed: true, checks, serial, packageId }, null, 2));
  console.log('Android smoke completed: ' + checks + ' checks.');
}
if (require.main === module) main().catch(async error => {
  console.error(error);
  try { await screenshot('failure.png'); console.error(await evaluate('document.body.innerText')); } catch {}
  process.exitCode = 1;
}).finally(() => { socket?.close(); });
module.exports = { adb, connect, evaluate, command, click, fill, screenshot, saved, until, pause, close: () => socket?.close(), root, packageId, artifact };
