// Real soft-keyboard, touch-scroll and press-and-hold regression on the .dev
// package in a disposable emulator. Never changes the user's running device.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const t = require('./test-android.cjs');
let checks = 0;
function check(value, label) { assert.ok(value, label); checks++; console.log('PASS', label); }
function keyboardVisible() {
  const state = t.adb('shell', 'dumpsys', 'input_method');
  // The IME service can retain mIsInputViewShown=true after its window closes.
  const shown = state.match(/\bmInputShown=(true|false)/);
  return shown ? shown[1] === 'true' : /(?:mIsInputViewShown|isInputViewShown)=true/.test(state);
}
async function visibleKeyboard() {
  for (let i=0;i<15;i++) { if(keyboardVisible()) return; await t.pause(150); }
  throw new Error('Expected visible Android soft keyboard');
}
async function point(label) {
  return t.evaluate(`(() => {const b=[...document.querySelectorAll('button')].find(e=>e.innerText.trim()===${JSON.stringify(label)}); const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,dpr:devicePixelRatio}})()`);
}
async function main() {
  await fs.mkdir(t.artifact,{recursive:true});
  t.adb('install','-r',path.join(t.root,'android/app/build/outputs/apk/debug/app-debug.apk'));
  t.adb('shell','pm','clear',t.packageId); await t.pause(1000);
  t.adb('shell','am','start','-W','-n',`${t.packageId}/com.recallmate.mobile.MainActivity`);
  await t.connect(); await t.until('document.querySelector(".first-bank") !== null','home');
  await t.click('导入题库');
  const text = '# 长题键盘回归\n' + '请阅读材料并填写答案，题目内容需要能够完整查看。'.repeat(3) + '{{甲乙}}。\n' + '后续材料包含多个段落，需要上下滑动查看全部内容。\n'.repeat(8) + '最后一项填写{{丙丁}}，到此结束。';
  await t.fill('#import-text',text); await t.click('导入 1 道题目'); await t.saved(); await t.click('开始练习');
  if (await t.evaluate('!!document.querySelector(".toast")')) await t.click('关闭消息');
  check(await t.evaluate('document.querySelector(".app-header").offsetHeight>0 && !document.querySelector(".practice-top,.progress-track")'),'Compact practice toolbar is visible without duplicate navigation before opening the keyboard');
  await t.fill('input[aria-label="第 1 个填空"]','甲'); await visibleKeyboard(); await t.pause(600);
  const height = await t.evaluate('innerHeight');
  check(await t.evaluate('document.querySelector(".native-app").dataset.practiceFocus==="true" && [".app-header",".app-footer"].every(s=>document.querySelector(s).offsetHeight===0)'),'Real keyboard hides the title, exit navigation, progress and footer');
  check(await t.evaluate('!document.querySelector(".question-feedback") && !document.querySelector(".practice-page").textContent.includes("输入后点击")'),'Idle confirmation instructions reserve no space in the question area');
  check(await t.evaluate('(()=>{const q=document.querySelector(".cloze-body").getBoundingClientRect();return q.top<80 && q.height>innerHeight*.55})()'),'Question starts near the system status bar and occupies most of the space above the keyboard');
  check(await t.evaluate('(()=>{const q=document.querySelector(".cloze-body");return q.scrollHeight>q.clientHeight && q.clientHeight>40 && getComputedStyle(q).overflowY==="auto"})()'),'Long question has its own usable vertical scroll area with keyboard open');
  const geometry = '(()=>{const q=document.querySelector(".cloze-body").getBoundingClientRect(),a=document.querySelector(".practice-actions").getBoundingClientRect();return q.bottom<=a.top+1 && a.bottom<=innerHeight+1})()';
  check(await t.evaluate(geometry),'Question, feedback and action bar do not overlap above the keyboard');
  await t.evaluate('document.querySelector(".cloze-body").scrollTop=0'); await t.pause(150);
  const swipe=await t.evaluate('(()=>{const r=document.querySelector(".cloze-body").getBoundingClientRect();return {x:Math.round((r.x+r.width/2)*devicePixelRatio),y1:Math.round((r.y+r.height*.85)*devicePixelRatio),y2:Math.round((r.y+r.height*.2)*devicePixelRatio)}})()');
  t.adb('shell','input','swipe',String(swipe.x),String(swipe.y1),String(swipe.x),String(swipe.y2),'400'); await t.pause(200);
  check(await t.evaluate('document.querySelector(".cloze-body").scrollTop>10') && keyboardVisible(),'Native upward swipe scrolls the question without hiding the keyboard');
  await t.evaluate('document.querySelector(".cloze-body").scrollTop=document.querySelector(".cloze-body").scrollHeight'); await t.pause(150);
  check(await t.evaluate('(()=>{const q=document.querySelector(".cloze-body").getBoundingClientRect(),i=document.querySelectorAll(".blank-wrap input")[1].getBoundingClientRect();return i.top>=q.top && i.bottom<=q.bottom+1 && document.querySelector(".practice-main").scrollTop===0})()'),'Bottom blank is reachable within the question area while the surrounding layout stays fixed');
  const hint=await point('提示'); t.adb('shell','input','tap',String(Math.round(hint.x*hint.dpr)),String(Math.round(hint.y*hint.dpr))); await t.pause(500);
  check(await t.evaluate('document.querySelector(".blank-wrap input").value==="甲乙"'),'Native hint button still supplies the missing character');
  check(keyboardVisible() && await t.evaluate('document.activeElement===document.querySelector(".blank-wrap input") && innerHeight<='+height+'+5'),'Hint preserves the active input and visible soft keyboard');
  const before=await t.evaluate('document.querySelector(".blank-wrap input").value');
  await t.evaluate('document.querySelector(".blank-wrap input").setSelectionRange(1,1)');
  const answer=await point('答案（按住）');
  await t.command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:answer.x,y:answer.y}]}); await t.pause(650);
  check(await t.evaluate('document.querySelectorAll(".blank-wrap.peeking").length===2 && !document.querySelector(".blank-wrap input").readOnly') && keyboardVisible(),'Holding answer reveals both references without making the input readonly or dismissing the keyboard');
  await t.command('Input.insertText',{text:'不应写入'}); await t.pause(100);
  check(await t.evaluate('document.querySelector(".blank-wrap input").value')===before,'Typing while holding the reference cannot change the saved answer');
  await t.command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await t.pause(350);
  check(await t.evaluate('!document.querySelector(".peeking") && document.activeElement===document.querySelector(".blank-wrap input") && document.activeElement.selectionStart===1') && keyboardVisible(),'Releasing answer restores the caret and keeps the keyboard visible');
  await t.screenshot('keyboard-scroll-hint.png');
  check(await t.evaluate(geometry),'Long-question layout remains separated after hint and reference interactions');
  t.adb('shell','input','keyevent','KEYCODE_BACK'); await t.pause(700);
  check(!keyboardVisible() && await t.evaluate('!!document.querySelector(".practice-page") && !document.querySelector(".native-app").dataset.practiceFocus && [".app-header",".app-footer"].every(s=>document.querySelector(s).offsetHeight>0)'),'Hiding the keyboard restores navigation without leaving practice');
  check(await t.evaluate('document.querySelector(".blank-wrap input").value')===before,'Collapsing and restoring navigation preserves the answer');
  await t.screenshot('keyboard-hidden-restored.png');
  await t.fill('input[aria-label="第 1 个填空"]',before); await visibleKeyboard(); await t.pause(500);
  check(await t.evaluate('document.querySelector(".native-app").dataset.practiceFocus==="true" && document.querySelector(".app-header").offsetHeight===0'),'Reopening the keyboard enters the compact layout again');
  await t.click('确认答案'); await t.click('确认答案');
  check(await t.evaluate('document.querySelector(".question-feedback")?.textContent.includes("遗漏")') && await t.evaluate(geometry),'Actual incomplete-answer feedback remains visible without overlapping the question or buttons');
  await t.fill('input[aria-label="第 2 个填空"]','丙丁'); await t.click('确认答案');
  check(await t.evaluate('document.querySelector(".question-feedback").textContent.includes("全部答对")'),'Completion feedback is retained');
  await t.click('下一题'); await t.pause(500);
  check(await t.evaluate('!!document.querySelector(".summary-card") && !document.querySelector(".native-app").dataset.practiceFocus && document.querySelector(".app-header").offsetHeight>0'),'Finishing practice restores the app header');
  await t.click('返回题库'); await t.click('题库'); await t.click('导入题库');
  await t.fill('#import-text','# 短题布局回归\n3. 分类包括{{甲}}、{{乙}}、{{丙}}三级。');
  await t.click('导入 1 道题目'); await t.saved(); await t.click('开始练习');
  if (await t.evaluate('!!document.querySelector(".toast")')) await t.click('关闭消息');
  await t.fill('input[aria-label="第 2 个填空"]','乙'); await visibleKeyboard(); await t.pause(600);
  check(await t.evaluate('(()=>{const q=document.querySelector(".cloze-body").getBoundingClientRect();return [...document.querySelectorAll(".blank-wrap input")].every(e=>{const r=e.getBoundingClientRect();return r.top>=q.top && r.bottom<=q.bottom}) && !document.querySelector(".question-feedback") && document.querySelector(".native-app").dataset.practiceFocus==="true"})()'),'Three-blank short question fits above the keyboard without permanent instructional text');
  await t.screenshot('keyboard-compact-short.png');
  await fs.writeFile(path.join(t.artifact,'keyboard-result.json'),JSON.stringify({passed:true,checks},null,2));
  console.log('Keyboard regression completed: '+checks+' checks.');
}
main().catch(async error=>{console.error(error);try{await t.screenshot('keyboard-failure.png');console.error(await t.evaluate('document.body.innerText'))}catch{}process.exitCode=1}).finally(t.close);
