// Uses only the disposable emulator's debug package and real native storage.
const t=require('./test-android.cjs');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
let checks=0;
function check(value,label){assert.ok(value,label);checks++;console.log('PASS',label);}
const records=()=>t.evaluate('window.Capacitor.nativePromise("RecallMateFiles","list",{})');
const bundle=async()=>JSON.parse((await records()).records[0].main);
async function paste(pkg){await t.click('导入题库');await t.fill('#import-text',JSON.stringify(pkg));await t.adb('shell','input','keyevent','KEYCODE_BACK');await t.pause(400);}
async function select(value){await t.evaluate(`document.querySelector('.objective-options input[value="${value}"]').click()`);await t.pause(100);}
async function restart(){await t.saved();t.close();t.adb('shell','am','force-stop',t.packageId);t.adb('shell','am','start','-W','-n',t.packageId+'/com.recallmate.mobile.MainActivity');await t.connect();await t.until('!!document.querySelector(".bank-row")','restart home');}
async function main(){
  await fs.mkdir(t.artifact,{recursive:true});
  t.adb('install','-r',path.join(t.root,'android/app/build/outputs/apk/debug/app-debug.apk'));
  t.adb('shell','pm','clear',t.packageId);await t.pause(1000);
  t.adb('shell','am','start','-W','-n',t.packageId+'/com.recallmate.mobile.MainActivity');await t.connect();await t.until('!!document.querySelector(".first-bank")','home');
  const fixture=JSON.parse(await fs.readFile(path.join(t.root,'_doc/examples/mixed-demo.questionbank.json'),'utf8'));
  const fixturePath=path.join(t.artifact,'RecallMate-Mixed-Test.questionbank.json');await fs.writeFile(fixturePath,JSON.stringify(fixture));t.adb('push',fixturePath,'/sdcard/Download/RecallMate-Mixed-Test.questionbank.json');
  await t.click('导入题库');await t.evaluate('document.querySelector(".file-drop").click()');await t.pause(600);
  if(!(await t.nativeUi()).includes('text="RecallMate-Mixed-Test.questionbank.json"')){await t.nativeTap(n=>/Show roots|Open navigation drawer/i.test(n['content-desc']||''),'locations');await t.nativeTap(n=>n.text==='Downloads','downloads');}
  await t.nativeTap(n=>n.text==='RecallMate-Mixed-Test.questionbank.json','content package');await t.until('document.querySelector("#import-text")?.value.includes("recallmate.question-bank")','system JSON import');
  check(await t.evaluate('document.querySelector(".import-preview").textContent.includes("多选 1")'),'Four question types preview on the phone');
  await t.click('导入 4 道题目');await t.saved();await t.click('开始练习');
  check(await t.evaluate('document.querySelector(".native-app").dataset.practiceLayout==="minimal" && !document.querySelector(".practice-top,.progress-track")'),'All practice uses a single compact toolbar');
  await t.fill('input[aria-label="第 1 个填空"]','RecallMate');await t.click('确认答案');await t.click('下一题');await t.pause(500);
  check(await t.evaluate('!document.querySelector(".native-app").dataset.practiceFocus && document.querySelectorAll(".objective-options input:checked").length===0 && !document.activeElement?.matches(".objective-options input")'),'Cloze to judgment dismisses keyboard without focusing an option');
  await t.click('提交答案');
  check(await t.evaluate('!document.querySelector("fieldset").disabled && document.querySelector("[role=alert]").textContent.includes("请先选择")'),'Empty submit does not lock the question');
  check(Object.values((await bundle()).bank.stats).reduce((n,s)=>n+s.wrongAttemptCount,0)===0,'Empty submit does not add a wrong answer');
  await select('false');await restart();await t.click(fixture.bank.name);await t.click('继续练习');
  check(await t.evaluate('document.querySelector("input[value=false]").checked && !document.querySelector("fieldset").disabled'),'False selection draft survives process restart');
  await t.click('提交答案');
  check(await t.evaluate('document.querySelector("fieldset").disabled && document.querySelector(".question-feedback").textContent==="本题答对"'),'Judgment false answer grades and locks correctly');
  check(await t.evaluate('document.querySelector(".answer-explanation").firstElementChild.classList.contains("question-rationale") && document.querySelector(".question-rationale").open && document.querySelector(".knowledge-panel").open'),'Explanation precedes knowledge and both open by default');
  await t.evaluate('document.querySelector(".knowledge-panel>summary").click()');
  check(await t.evaluate('!document.querySelector(".knowledge-panel").open && document.querySelector(".question-rationale").open'),'Knowledge collapses independently');
  await restart();await t.click(fixture.bank.name);await t.click('继续练习');
  check(await t.evaluate('document.querySelector("fieldset").disabled'),'Submitted result survives restart');
  const before=await bundle();check(before.bank.stats[before.bank.questions[1].id].independentCorrectCount===1,'Restart does not double count a correct answer');
  await t.click('下一题');await select('A');await t.click('提交答案');
  check(await t.evaluate('document.querySelector(".option-incorrect input").value==="A" && document.querySelector(".option-correct input").value==="B"'),'Single choice highlights incorrect and expected options');
  check(await t.evaluate('document.querySelectorAll(".option-explanations>li").length===3 && [...document.querySelectorAll(".option-explanations>li")].every(li=>li.querySelector("strong")&&li.querySelector("blockquote")&&li.querySelector(".option-explanation-option"))'),'Each explanation contains option text, evidence and conclusion');
  await t.screenshot('mixed-single-phone.png');await t.click('下一题');await select('A');await select('D');await t.click('提交答案');
  check(await t.evaluate('document.querySelectorAll(".option-missing").length===2 && document.querySelectorAll(".option-incorrect").length===1'),'Multiple choice separates omitted and extra answers');
  check(await t.evaluate('document.querySelector(".practice-actions").getBoundingClientRect().bottom<=innerHeight && getComputedStyle(document.querySelector(".objective-body")).overflowY==="auto" && document.documentElement.scrollWidth<=innerWidth'),'Long explanations scroll while the action button stays reachable');
  await t.screenshot('mixed-multiple-phone.png');await t.click('字号');await t.evaluate('document.querySelector("input[aria-label=练习字号]").focus()');await t.command('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End',windowsVirtualKeyCode:35});await t.command('Input.dispatchKeyEvent',{type:'keyUp',key:'End',code:'End',windowsVirtualKeyCode:35});await t.click('字号');
  check(await t.evaluate('parseFloat(getComputedStyle(document.querySelector(".objective-stem")).fontSize)===40 && document.querySelector(".practice-actions").getBoundingClientRect().bottom<=innerHeight && document.documentElement.scrollWidth<=innerWidth'),'Maximum font preserves scrolling and reachable actions on the phone');await t.screenshot('mixed-maximum-font-phone.png');await t.click('字号');await t.click('恢复默认字号');await t.click('字号');await t.saved();const completed=await bundle();
  check(completed.bank.stats[completed.bank.questions[2].id].inWrongBook && completed.bank.stats[completed.bank.questions[3].id].wrongAttemptCount===1,'Objective mistakes enter their bank wrong-book once');
  await t.click('下一题');check(await t.evaluate('!!document.querySelector(".summary-card")'),'Four types share the session summary');await t.click('返回题库');
  await t.evaluate('document.querySelector("[aria-label=题型筛选]").value="multiple_choice";document.querySelector("[aria-label=题型筛选]").dispatchEvent(new Event("change",{bubbles:true}))');
  check(await t.evaluate('document.querySelectorAll(".question-row").length===1'),'Type filter works on the phone');
  await t.click('开始练习');await t.click('不会／看答案');await t.saved();
  check(await t.evaluate('document.querySelector("fieldset").disabled && document.querySelector(".question-feedback").textContent.includes("记一次求助")'),'Viewing an objective answer records help and locks selection');await t.click('退出练习');
  const contentPath='/sdcard/Download/'+fixture.bank.name+'.questionbank.json',quoted="'"+contentPath.replaceAll("'","'\\''")+"'";t.adb('shell','rm','-f',quoted);await t.click('导出题库内容');await t.pause(500);await t.nativeTap(n=>/^save$/i.test(n.text||''),'save content');await t.until('document.querySelector(".toast")?.textContent.includes("已导出题库内容")','content export');const exported=JSON.parse(t.adb('shell','cat',quoted));check(exported.format==='recallmate.question-bank'&&exported.questions.length===4&&!exported.session&&!exported.bank.stats,'System save picker exports question content without personal progress');
  await t.click('题库');const appended=structuredClone(fixture);appended.questions.push({id:'new-tf',type:'true_false',stem:'新增演示判断。',answer:true});await paste(appended);
  const id=completed.bank.id;await t.evaluate(`document.querySelector('#import-target').value=${JSON.stringify(id)};document.querySelector('#import-target').dispatchEvent(new Event('change',{bubbles:true}))`);await t.click('导入 5 道题目');await t.saved();
  const after=await bundle();check(after.bank.questions.length===5 && after.session.questionIds.length===1 && after.bank.stats[completed.bank.questions[1].id].independentCorrectCount===1,'Append deduplicates questions and preserves the fixed session and statistics');
  await t.click('题库');const conflict=structuredClone(appended);conflict.questions[0].stem='冲突的{{内容}}';await paste(conflict);await t.evaluate(`document.querySelector('#import-target').value=${JSON.stringify(id)};document.querySelector('#import-target').dispatchEvent(new Event('change',{bubbles:true}))`);await t.pause(200);
  check(await t.evaluate('document.querySelector(".parse-errors").textContent.includes("冲突")'),'Conflicting append is blocked before writing');await t.click('取消');
  const privatePath=path.join(t.root,'.local/questionbanks/RecallMate_保密内测卷_完整解析版.questionbank.json');
  try{const exam=JSON.parse(await fs.readFile(privatePath,'utf8'));
    // Review UI coverage must not depend on whether the local source was already approved.
    const reviewQuestion=exam.questions.find(q=>q.type!=='cloze');
    assert.ok(reviewQuestion,'The local acceptance exam contains an objective question');
    reviewQuestion.reviewStatus='needs_review';reviewQuestion.reviewNote='Confirm this test copy before import.';
    await paste(exam);
    check(await t.evaluate('document.querySelector(".import-confirm input") && [...document.querySelectorAll(".modal-footer button")].find(b=>b.textContent.includes("导入 50")).disabled'),'Private full exam asks to confirm marked review items');
    await t.evaluate('document.querySelector(".import-confirm input").click()');await t.click('导入 50 道题目');await t.saved();const all=(await records()).records.map(r=>JSON.parse(r.main));const e=all.find(b=>b.bank.questions.length===50);
    check(e.bank.knowledgePoints.length===105 && e.bank.questions.every(q=>q.explanation),'Full local exam imports 50 explanations and 105 knowledge points');
    check(exam.questions.filter(q=>q.reviewStatus==='needs_review').every(q=>e.bank.questions.find(x=>x.externalId===q.id)?.sourceText===q.stem),'Confirmed review questions retain the original answer text');
    await t.screenshot('mixed-full-exam-phone.png');
  }catch(error){if(error.code!=='ENOENT')throw error;}
  await fs.writeFile(path.join(t.artifact,'mixed-result.json'),JSON.stringify({passed:true,checks},null,2));console.log('Mixed Android completed: '+checks+' checks.');
}
main().catch(async e=>{console.error(e);try{console.error(await t.evaluate('document.body.innerText'));await t.screenshot('mixed-failure.png')}catch{}process.exitCode=1}).finally(t.close);
