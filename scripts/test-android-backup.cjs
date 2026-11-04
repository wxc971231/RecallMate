// Round-trip a real Windows V2 backup through Android's UI and system save picker.
const t=require('./test-android.cjs'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
async function main(){
 const profile=process.env.RECALLMATE_DESKTOP_TEST_PROFILE;if(!profile)throw Error('Set the isolated Windows test profile');
 const files=await fs.readdir(path.join(profile,'banks'));let source;
 for(const file of files.filter(f=>f.endsWith('.json'))){const b=JSON.parse(await fs.readFile(path.join(profile,'banks',file),'utf8'));if(new Set(b.bank.questions.map(q=>q.type)).size===4){source=b;break;}}
 assert.ok(source,'Real Windows four-type backup available');
 t.adb('shell','am','force-stop',t.packageId);t.adb('shell','am','start','-W','-n',t.packageId+'/com.recallmate.mobile.MainActivity');await t.connect();await t.until('!!document.querySelector(".bank-row")','home');
 await t.click('导入题库');await t.fill('#import-text',JSON.stringify(source));t.adb('shell','input','keyevent','KEYCODE_BACK');await t.pause(400);await t.click('恢复备份');await t.saved();
 const loaded=await t.evaluate('window.Capacitor.nativePromise("RecallMateFiles","list",{})');assert.deepEqual(JSON.parse(loaded.records.find(r=>r.id===source.bank.id).main),source);console.log('PASS Windows V2 backup restores all types, knowledge, session and statistics on Android');
 const filename='/sdcard/Download/'+source.bank.name+'.recallmate.json',quoted="'"+filename.replaceAll("'","'\\''")+"'";t.adb('shell','rm','-f',quoted);await t.click('导出备份');await t.pause(500);await t.nativeTap(n=>/^save$/i.test(n.text||''),'save backup');await t.until('document.querySelector(".toast")?.textContent.includes("备份已保存")','backup saved');
 const text=t.adb('shell','cat',quoted);assert.deepEqual(JSON.parse(text),source);await fs.writeFile(path.join(t.artifact,'cross-platform-backup.recallmate.json'),text);console.log('PASS Android full export round-trips the Windows backup without losing or changing records');
 await fs.writeFile(path.join(t.artifact,'backup-result.json'),JSON.stringify({passed:true,checks:2},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(t.close);
