// Production renderer + real sandboxed preload + real IPC/filesystem; isolated test profile.
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const profile = process.env.RECALLMATE_TEST_PORTABLE_ROOT
  ? path.join(path.resolve(process.env.RECALLMATE_TEST_PORTABLE_ROOT), 'data')
  : path.join(root, 'artifacts', `desktop-test-${Date.now()}`);
process.env.RECALLMATE_DATA_DIR = profile;
process.env.RECALLMATE_TEST = '1';
app.commandLine.appendSwitch('disable-gpu');
delete process.env.ELECTRON_RENDERER_URL;
let assertions = 0;
const check = (condition, message) => { assert.ok(condition, message); assertions++; console.log('PASS', message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let target;
const networkRequests = [];
app.whenReady().then(() => session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => { networkRequests.push(details.url); callback({ cancel: true }); }));
const evaluate = async source => {
  try { return await target.webContents.executeJavaScript(source, true); }
  catch (error) { console.error('Failed renderer test expression:', source); throw error; }
};
async function until(source, message) {
  for (let i = 0; i < 100; i++) { if (await evaluate(source)) return; await delay(50); }
  throw new Error('Timeout: ' + message);
}
async function click(label) {
  const clicked = await evaluate(`(() => { const el = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)}); if (!el || el.disabled) return false; el.click(); return true; })()`);
  assert.ok(clicked, 'Button not available: ' + label); await delay(80);
}
async function clickAria(label) {
  const clicked = await evaluate(`(() => { const el = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!el || el.disabled) return false; el.click(); return true; })()`);
  assert.ok(clicked, 'Button not available: ' + label); await delay(80);
}
async function maximumFont(label) {
  await evaluate(`document.querySelector('input[aria-label="${label}"]').focus()`);
  target.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'End' });
  target.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'End' }); await delay(100);
}
async function fill(label, value) {
  await evaluate(`(() => { const input = document.querySelector('[aria-label="${label}"]'); input.focus(); input.select(); })()`);
  await delay(40);
  target.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' });
  target.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' });
  await until(`document.querySelector('[aria-label="${label}"]').value === ""`, 'native selection cleared: ' + label);
  // Allow the native text/IME commit to settle before the separate submit key.
  await target.webContents.insertText(value); await delay(160);
  assert.equal(await evaluate(`document.querySelector('[aria-label="${label}"]').value`), value, 'Native input committed: ' + label);
}
async function enter() { target.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); target.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' }); await delay(100); }
async function screenshot(name) {
  let image;
  for (let attempt = 0; attempt < 4; attempt++) {
    try { image = await target.webContents.capturePage(); break; }
    catch (error) { if (!String(error).includes('UnknownVizError') || attempt === 3) throw error; target.webContents.invalidate(); await delay(120); }
  }
  await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
  await fs.writeFile(path.join(root, 'artifacts', name), image.toPNG());
}

app.on('browser-window-created', (_event, win) => {
  target = win;
  win.webContents.setBackgroundThrottling(false);
  win.webContents.on('console-message', event => { if (event.level === 'error') console.error('Renderer:', event.message); });
  win.webContents.once('did-finish-load', async () => {
    try {
      await until('document.querySelector(".first-bank") !== null', 'home loaded');
      check(win.webContents.getLastWebPreferences().sandbox, 'Renderer sandbox enabled');
      check(win.webContents.getLastWebPreferences().contextIsolation, 'Context isolation enabled');
      check(await evaluate('typeof window.require === "undefined" && typeof window.recallmate?.load === "function"'), 'Node is isolated; sandboxed preload works');
      for (const name of ['userData', 'appData', 'sessionData', 'temp', 'logs', 'crashDumps']) {
        const configured = app.getPath(name);
        check(configured === profile || configured.startsWith(profile + path.sep), `${name} remains inside the selected data folder`);
      }
      await screenshot('home.png');
      await click('体验示例题库');
      check(await evaluate('document.querySelector("[role=dialog]").textContent.includes("20 道题目")'), 'Import preview parses 20 questions');
      check(await evaluate('Math.abs(document.querySelector(".import-source-heading").getBoundingClientRect().top-document.querySelector(".import-preview-heading").getBoundingClientRect().top)<1 && Math.abs(document.querySelector("#import-text").getBoundingClientRect().top-document.querySelector(".import-preview").getBoundingClientRect().top)<1'),'Import headings and content surfaces align across columns');
      check(await evaluate('Math.abs(document.querySelector("#bank-name").getBoundingClientRect().bottom-document.querySelector(".import-preview").getBoundingClientRect().bottom)<1'),'Import preview bottom aligns with source form');
      await screenshot('import-aligned.png');
      win.setContentSize(760,600);await delay(100);
      check(await evaluate('Math.abs(document.querySelector("#import-text").getBoundingClientRect().left-document.querySelector(".import-preview").getBoundingClientRect().left)<1 && document.querySelector(".import-grid").scrollWidth<=document.querySelector(".import-grid").clientWidth'),'Narrow import layout stacks cleanly without horizontal overflow');
      win.setContentSize(1180,820);await delay(100);

      await click('导入 20 道题目');
      await until('document.querySelectorAll(".question-row").length === 10', 'import saved and detail loaded');
      check((await fs.readdir(path.join(profile, 'banks'))).length === 1, 'Import persists a JSON bank through IPC');
      await clickAria('关闭消息');
      check(await evaluate('!document.querySelector(".sidebar") && !document.querySelector(".welcome")'), 'Compact layout removes sidebar and promotional content');
      await clickAria('第2页'); check(await evaluate('document.querySelector(".question-number").textContent === "11"'), 'Question pagination opens page two');
      await clickAria('第1页'); await screenshot('detail-compact.png');
      await click('开始练习');
      await until('document.querySelector(".question-card") !== null', 'practice loaded');
      check(await evaluate('!document.activeElement?.matches(".blank-wrap input")'), 'Opening a cloze question does not autofocus an answer');
      check(await evaluate('[...document.querySelectorAll(".blank-wrap input")].every(input => !input.placeholder)'), 'Answer fields contain no numeric placeholders');
      await fill('第 1 个填空', '线粒体'); await enter();
      check(await evaluate('document.querySelectorAll(".judge-correct").length === 1 && document.querySelectorAll(".judge-incorrect").length === 2'), 'Enter highlights correct and incorrect characters separately');
      await enter();
      check((await evaluate('(async () => (await window.recallmate.load()).bundles[0].bank.stats)()')) !== null, 'Statistics available through constrained IPC');
      await fill('第 1 个填空', '叶绿体');
      check(await evaluate('document.querySelector(".blank-label").textContent === "第 1 空"'), 'Editing clears previous judgment');
      await enter();
      check(await evaluate('document.querySelector(".question-feedback").textContent.includes("全部答对")'), 'Correct answer retains feedback before moving');
      await enter();
      await until('document.querySelector(".question-meta").textContent.includes("第 2 题")', 'next question');
      await fill('第 1 个填空', 'H2O');
      await evaluate(`document.querySelector('input[aria-label="第 1 个填空"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, bubbles: true }))`);
      check(await evaluate('document.querySelector(".blank-label").textContent === "第 1 空"'), 'IME composition Enter does not judge');
      await enter(); check(await evaluate('document.querySelector(".question-feedback").textContent.includes("全部答对")'), 'Alternate answer H2O is accepted');
      await enter(); await until('document.querySelector(".question-meta").textContent.includes("第 3 题")', 'third question');
      await fill('第 1 个填空', 'test');
      await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent === '答案（按住）'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 })); })()`);
      check(await evaluate('document.querySelector(".blank-wrap").classList.contains("peeking") && document.querySelector(".blank-wrap input").value === "test"'), 'Held answer is visual only, original input remains');
      await evaluate(`window.dispatchEvent(new Event('blur'))`);
      check(await evaluate('!document.querySelector(".blank-wrap").classList.contains("peeking") && document.querySelector(".blank-wrap input").value === "test"'), 'Window blur restores original answer');
      await click('提示');
      check(await evaluate('document.querySelector(".blank-wrap input").value === "D"'), 'Hint replaces wrong tail with one character');
      await screenshot('practice.png');
      await until('document.querySelector(".save-indicator").textContent.includes("已保存")', 'draft saved before font change');
      const beforeFontChange = (await evaluate('window.recallmate.load()')).bundles[0].session.currentAttempt;
      await click('字号'); await maximumFont('界面字号'); await maximumFont('练习字号');
      check(await evaluate('getComputedStyle(document.documentElement).fontSize === "20px"'), 'Interface font grows to 20px');
      check(await evaluate('getComputedStyle(document.querySelector(".question-text")).fontSize === "40px" && getComputedStyle(document.querySelector(".blank-wrap input")).fontSize === "40px"'), 'Practice question and inputs scale together to 40px');
      await click('字号');
      await until('document.querySelector(".save-indicator").textContent.includes("已保存")', 'font changes saved');
      const persistedSettings = JSON.parse(await fs.readFile(path.join(profile, 'app-settings.json'), 'utf8'));
      check(persistedSettings.uiFontSize === 20 && persistedSettings.practiceFontSize === 40, 'Font preferences persist inside portable data folder');
      check(JSON.stringify((await evaluate('window.recallmate.load()')).bundles[0].session.currentAttempt) === JSON.stringify(beforeFontChange), 'Changing fonts preserves answer, judgment, hints and attempt');
      win.setContentSize(760, 600); await delay(120);
      check(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Maximum fonts do not overflow minimum window');
      check(await evaluate('(() => {const r = document.querySelector(".submit-button").getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight - 25;})()'), 'Submit remains visible with maximum fonts in minimum window');
      check(await evaluate('[...document.querySelectorAll(".practice-actions button")].every(b => {const r=b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight - 25;})'), 'All practice actions stay visible with maximum fonts');
      await screenshot('practice-large-font.png'); win.setContentSize(1180, 820); await delay(100);
      await click('退出练习');
      await until('document.querySelectorAll(".question-row").length === 10', 'back to detail');
      await click('继续练习');
      check(await evaluate('document.querySelector(".blank-wrap input").value === "D"'), 'Continue restores hinted draft and queue');
      await click('放弃');
      check(await evaluate('document.querySelector(".blank-wrap input").readOnly && document.querySelector(".blank-wrap input").value === "DNA"'), 'Give up fills and locks answer');
      await delay(260);
      await click('下一题');
      // Real persisted data is reloaded through the same preload used by the product.
      await delay(500);
      const saved = (await evaluate('window.recallmate.load()')).bundles[0];
      check(await evaluate('window.recallmate.exportFile(' + JSON.stringify(saved) + ')'), 'Backup export completes without an external save dialog');
      const exportedFiles = await fs.readdir(path.join(profile, 'exports'));
      check(exportedFiles.length === 1, 'Exported JSON stays inside data/exports');
      check(saved.bank.stats[saved.bank.questions[0].id].wrongAttemptCount === 1, 'Repeated wrong submissions count once');
      check(saved.bank.stats[saved.bank.questions[1].id].independentCorrectCount === 1, 'Independent success counted correctly');
      check(saved.bank.stats[saved.bank.questions[2].id].helpAttemptCount === 1, 'Peek, hint and give up count as one help attempt');
      check(saved.session.currentIndex === 3, 'Current practice queue persisted');
      await evaluate('location.reload()');
      await until('document.querySelector(".bank-row") !== null', 'app reload');
      await screenshot('home-with-bank.png');
      check(await evaluate('getComputedStyle(document.documentElement).fontSize === "20px"'), 'Interface font restores after reload');
      await click('继续练习');
      check(await evaluate('getComputedStyle(document.querySelector(".question-text")).fontSize === "40px"'), 'Practice font restores after reload');
      await click('字号'); await click('恢复默认字号'); await click('字号');
      check(await evaluate('getComputedStyle(document.documentElement).fontSize === "14px" && getComputedStyle(document.querySelector(".question-text")).fontSize === "24px"'), 'Default fonts can be restored');
      check(await evaluate('document.querySelector(".question-meta").textContent.includes("第 4 题")'), 'App reload restores persisted session');
      win.setContentSize(760, 600); await delay(100);
      check(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), '760×600 practice layout has no horizontal clipping');
      check(await evaluate('[...document.querySelectorAll("button")].some(b => b.textContent.includes("确认答案") && b.offsetWidth > 0)'), 'Clickable submit remains available in minimum window');
      await screenshot('practice-small.png');
      await click('退出练习');
      const methods = await evaluate('Object.keys(window.recallmate).sort()');
      check(!methods.includes('fs') && !methods.includes('ipcRenderer'), 'Bridge exposes no unrestricted filesystem or IPC');
      check(networkRequests.length === 0, 'Production app works with all HTTP requests blocked');
      // A second bank exercises the new matching rules through the actual UI.
      win.setContentSize(1180, 820); await click('设置');
      check(await evaluate('document.querySelector("#strict-blank-order").checked && document.querySelector("#strict-blank-order").getAttribute("role") === "switch"'), 'Desktop strict fill mode defaults to enabled');
      await evaluate('document.querySelector("#strict-blank-order").click()');
      await until('document.querySelector(".save-indicator").textContent.includes("已保存")', 'relaxed matching setting saved');
      await clickAria('关闭弹窗'); await click('题库'); await click('导入题库');
      await evaluate('document.querySelector("#import-text").focus()');
      await target.webContents.insertText('# 匹配规则测试\n{{实事求是}}。\n---\n{{叶绿体}}。\n---\n{{甲、乙、丙}}。\n---\n{{甲}}、{{乙}}、{{丙}}。\n---\n{{甲|乙}}、{{甲}}。\n---\n{{甲}}、{{乙}}。\n---\n{{甲}} 和 {{乙}}。\n---\n{{a}}、{{b}}、{{c}} 和 {{d}}。\n---\n{{a、b、c 和 d}}。');
      await click('导入 9 道题目'); await click('开始练习');
      await fill('第 1 个填空', '实事求似'); await enter();
      check(await evaluate('[...document.querySelectorAll(".judge-correct")].map(e => e.textContent).join("") === "实事求" && [...document.querySelectorAll(".judge-incorrect")].map(e => e.textContent).join("") === "似"'), 'Replacement feedback colors only the wrong character red');
      await until('document.querySelector(".save-indicator").textContent.includes("已保存")', 'partial answer saved');
      await evaluate('location.reload()'); await until('document.querySelector(".bank-row") !== null', 'partial restore home');
      await click('匹配规则测试'); await click('继续练习');
      check(await evaluate('document.querySelector(".blank-label").textContent === "部分正确" && document.querySelectorAll(".judge-correct").length === 3'), 'Partial judgment and character feedback restore after reload');
      await screenshot('partial-answer.png');
      await fill('第 1 个填空', '实事求是');
      check(await evaluate('document.querySelectorAll(".judge-correct,.judge-incorrect").length === 0'), 'Editing clears old per-character judgment');
      await enter(); await enter();
      await fill('第 1 个填空', '叶体'); await enter();
      check(await evaluate('document.querySelectorAll(".judge-correct").length === 2 && document.querySelectorAll(".judge-incorrect").length === 0 && document.querySelector(".blank-label").textContent === "尚未完整"'), 'A missing middle character preserves the correct suffix');
      check(await evaluate('!document.querySelector(".question-card").textContent.includes("绿")'), 'Missing-character feedback does not reveal the answer');
      await click('提示');
      check(await evaluate('document.querySelector(".blank-wrap input").value === "叶绿体" && [...document.querySelectorAll(".source-hint")].map(e=>e.textContent).join("") === "绿"'), 'Hint inserts one missing character and preserves user text');
      await enter(); await enter();
      await fill('第 1 个填空', '丙、甲、乙'); await enter();
      check(await evaluate('document.querySelector(".question-feedback").textContent.includes("全部答对") && document.querySelector(".blank-wrap input").value === "丙、甲、乙"'), 'Single-blank enumeration accepts and preserves user order');
      await enter();
      await fill('第 1 个填空', '丙'); await enter(); await fill('第 2 个填空', '甲'); await enter(); await fill('第 3 个填空', '乙'); await enter();
      check(await evaluate('[...document.querySelectorAll(".blank-label")].every(e=>e.textContent === "✓ 正确")'), 'Multiple connected blanks accept any option order');
      await enter(); await fill('第 1 个填空', '甲'); await enter(); await fill('第 2 个填空', '乙'); await enter();
      check(await evaluate('document.querySelector(".question-feedback").textContent.includes("全部答对")'), 'Overlapping aliases are reassigned without false errors');
      await enter(); await fill('第 1 个填空', '乙'); await enter(); await fill('第 2 个填空', '乙'); await enter();
      check(await evaluate('document.querySelectorAll(".blank-label")[0].textContent === "✓ 正确" && document.querySelectorAll(".blank-label")[1].textContent === "含重复项"'), 'A repeated option does not displace a previously accepted answer');
      await screenshot('unordered-duplicate.png'); await click('提示');
      check(await evaluate('document.querySelectorAll(".blank-wrap input")[0].value === "乙" && document.querySelectorAll(".blank-wrap input")[1].value === "甲"'), 'Grouped hint selects the remaining unused option');
      await enter(); await enter();
      await fill('第 1 个填空', '乙'); await enter(); await fill('第 2 个填空', '甲'); await enter();
      check(await evaluate('document.querySelector(".question-feedback").textContent.includes("全部答对")'), 'And-connected blanks accept exchanged answers');
      await enter();
      for (const [index, value] of ['d', 'a', 'c', 'b'].entries()) { await fill(`第 ${index + 1} 个填空`, value); await enter(); }
      check(await evaluate('[...document.querySelectorAll(".blank-label")].every(e=>e.textContent === "✓ 正确")'), 'Mixed connectors form one four-option group across blanks');
      await screenshot('mixed-connectors.png'); await enter();
      await fill('第 1 个填空', 'd 和 c、a、b'); await enter();
      check(await evaluate('document.querySelector(".question-feedback").textContent.includes("全部答对") && document.querySelector(".blank-wrap input").value === "d 和 c、a、b"'), 'Single-blank mixed connectors preserve the entered order and separators');
      await enter(); await until('document.querySelector(".summary-card") !== null', 'matching summary');
      const matching = (await evaluate('window.recallmate.load()')).bundles.find(b => b.bank.name === '匹配规则测试');
      check(Object.values(matching.bank.stats).reduce((sum, s) => sum + s.wrongAttemptCount, 0) === 3, 'Partial and incomplete submissions retain once-per-attempt wrong statistics');
      await require('./test-desktop-shortcuts.cjs')({ evaluate, click, clickAria, fill, until, delay, screenshot, check, target });
      await require('./test-desktop-strict.cjs')({ evaluate, click, clickAria, fill, enter, until, delay, screenshot, check, target });
      await require('./test-desktop-mixed.cjs')({ evaluate, click, clickAria, fill, enter, until, delay, screenshot, check, target });
      await until('document.querySelector(".save-indicator").textContent.includes("已保存")', 'save complete');
      console.log(`Desktop smoke completed: ${assertions} assertions. Profile: ${profile}`);
      await fs.writeFile(path.join(root, 'artifacts', 'desktop-test-result.json'), JSON.stringify({ assertions, profile, passed: true }, null, 2));
      win.close();
      setTimeout(() => { if (BrowserWindow.getAllWindows().length) { console.error('Close flush handshake timed out'); app.exit(1); } }, 5000).unref();
    } catch (error) {
      console.error(error);
      try { console.error(await evaluate('JSON.stringify({ values: [...document.querySelectorAll(".blank-wrap input")].map(e=>e.value), feedback: document.querySelector(".question-card")?.outerHTML })')); await screenshot('desktop-failure.png'); } catch {}
      app.exit(1);
    }
  });
});
require(path.join(process.env.RECALLMATE_PACKAGED_ROOT || root, 'out/main/index.js'));
setTimeout(() => { console.error('Desktop test timeout'); app.exit(1); }, 180000).unref();
