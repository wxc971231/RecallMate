// Byte-for-byte V1 preservation and future-version guards on the debug emulator.
const t=require('./test-android.cjs'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const adb=path.join(process.env.ANDROID_HOME,'platform-tools/adb.exe'),serial=process.env.RECALLMATE_ANDROID_SERIAL||'emulator-5580';
if(!/^emulator-\d+$/.test(serial))throw Error('Disposable emulator required');
let checks=0;const check=(v,s)=>{assert.ok(v,s);checks++;console.log('PASS',s)};
function write(file,text){const local=path.join(t.artifact,'migration-input.json');require('node:fs').writeFileSync(local,text);t.adb('push',local,'/data/local/tmp/recallmate-migration-input.json');t.adb('shell','run-as',t.packageId,'sh','-c',`'cat /data/local/tmp/recallmate-migration-input.json > ${file}'`);}
function read(file){return execFileSync(adb,['-s',serial,'exec-out','run-as',t.packageId,'cat',file],{windowsHide:true}).toString('utf8');}
async function start(){t.adb('shell','am','start','-W','-n',t.packageId+'/com.recallmate.mobile.MainActivity');await t.connect();await t.until('!!document.querySelector(".bank-row")','legacy home');}
function stop(){t.close();t.adb('shell','am','force-stop',t.packageId);}
async function nativeSave(options){return t.evaluate(`(async()=>{try{await window.Capacitor.nativePromise('RecallMateFiles','write',${JSON.stringify(options)});return {ok:true}}catch(e){return {ok:false,message:e.message}}})()`);}
async function main(){
 t.adb('shell','pm','clear',t.packageId);await t.pause(1000);t.adb('shell','am','start','-W','-n',t.packageId+'/com.recallmate.mobile.MainActivity');await t.connect();await t.until('!!document.querySelector(".first-bank")','clean home');
 await t.click('体验示例题库');await t.click('导入 20 道题目');await t.click('开始练习');await t.fill('input[aria-label="第 1 个填空"]','草稿');await t.click('确认答案');await t.saved();
 const v2=JSON.parse((await t.evaluate('window.Capacitor.nativePromise("RecallMateFiles","list",{})')).records[0].main),v1=structuredClone(v2),id=v2.bank.id;
 assert.match(id,/^[a-f0-9-]{36}$/i);delete v1.format;v1.schemaVersion=v1.bank.schemaVersion=v1.session.schemaVersion=1;delete v1.bank.contentId;delete v1.bank.knowledgePoints;v1.bank.questions.forEach(q=>{delete q.type;delete q.externalId;});delete v1.session.currentAttempt.questionType;delete v1.session.currentAttempt.strictBlankOrder;
 const original='\r\n'+JSON.stringify(v1,null,4)+'\r\n',main=`files/recallmate/banks/${id}.json`,backup=`files/recallmate/backups/${id}.json.bak`,archive=`files/recallmate/migrations/${id}.v1.original.json`;
 stop();write(main,original);assert.equal(read(main),original,'Fixture bytes written correctly before launch');t.adb('shell','run-as',t.packageId,'rm','-f',backup);await start();
 check(read(main)===original,'Opening V1 data does not rewrite its original bytes');await t.click(v1.bank.name);await t.click('继续练习');
 check(await t.evaluate('document.querySelector(".blank-wrap input").value==="草稿"'),'V1 partial draft resumes in the new UI');
 await t.fill('input[aria-label="第 1 个填空"]','新草稿');await t.saved();
 check(read(archive)===original,'First V2 save archives the exact V1 text including CRLF and whitespace');
 const migrated=JSON.parse(read(main));check(migrated.schemaVersion===2 && migrated.bank.stats[v2.bank.questions[0].id].wrongAttemptCount===1 && !migrated.session.currentAttempt.strictBlankOrder,'Migration preserves statistics, identifiers and legacy unordered grading');
 await t.fill('input[aria-label="第 1 个填空"]','再修改');await t.saved();check(read(archive)===original,'Later saves never replace the V1 archive');
 // Simulate an unwritable archive directory. A failed archive must precede all bank writes.
 stop();write(main,original);t.adb('shell','run-as',t.packageId,'rm','-f',archive);t.adb('shell','run-as',t.packageId,'rmdir','files/recallmate/migrations');write('files/recallmate/migrations','test obstruction');await start();
 const backupBefore=read(backup);let result=await nativeSave({id,text:JSON.stringify(migrated),previous:original,legacyOriginal:original,preserve:false});
 check(!result.ok && read(main)===original && read(backup)===backupBefore,'Archive failure leaves both original bank and previous backup untouched');
 t.adb('shell','run-as',t.packageId,'rm','files/recallmate/migrations');result=await nativeSave({id,text:JSON.stringify(migrated),previous:original,legacyOriginal:original,preserve:false});
 check(result.ok && read(archive)===original,'Saving can retry safely after archive failure');
 const future=JSON.stringify({...migrated,schemaVersion:3});stop();write(main,future);t.adb('shell','am','start','-W','-n',t.packageId+'/com.recallmate.mobile.MainActivity');await t.connect();await t.until('!!document.querySelector(".warning-banner")','future version warning');
 check(await t.evaluate('!document.querySelector(".bank-row") && document.querySelector(".warning-banner").textContent.includes("升级")'),'Future-version bank blocks fallback to an older backup');
 result=await nativeSave({id,text:JSON.stringify(migrated),previous:original,preserve:false});check(!result.ok && read(main)===future,'Native filesystem refuses to overwrite a future-version bank');
 await fs.writeFile(path.join(t.artifact,'migration-result.json'),JSON.stringify({passed:true,checks},null,2));console.log('Native migration completed: '+checks+' checks.');
}
main().catch(async e=>{console.error(e);try{await t.screenshot('migration-failure.png')}catch{}process.exitCode=1}).finally(t.close);
