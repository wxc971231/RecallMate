import { useMemo, useState } from 'react';
import { ArrowRight, Upload } from 'lucide-react';
import { Modal } from './Modal';
import { createBank, validateBundle } from '../domain/banks';
import { parseQuestionFile } from '../domain/parser';
import { assertFileSize, importQuestionBankContent, previewQuestionBankPackage, type QuestionBankPackage } from '../domain/questionBankPackage';
import { questionTypeNames, questionTypes, type Bundle } from '../domain/types';
import { sampleText } from '../sample';

export function ImportModal({initialText,fileName,close,choose,imported,importContent,restore,banks}: {initialText:string;fileName?:string;close():void;choose():Promise<void>;imported(b:Bundle):Promise<void>;importContent(p:QuestionBankPackage,target?:string,name?:string):Promise<void>;restore(b:Bundle):Promise<void>;banks:Bundle[]}) {
  const [forceJson,setForceJson]=useState(!!fileName&&/\.json$/i.test(fileName));
  const [text,setText]=useState(initialText),[name,setName]=useState(''),[target,setTarget]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const preview=useMemo(()=>{
    if(!text.trim())return {};
    try { assertFileSize(text);if(forceJson||(text.trimStart().startsWith('{')&&!text.trimStart().startsWith('{{'))||text.trimStart().startsWith('[')) { const input=JSON.parse(text.replace(/^\uFEFF/,''));return input.format==='recallmate.question-bank'?{content:previewQuestionBankPackage(input)}:{backup:validateBundle(input)}; }
      const parsed=parseQuestionFile(text);if(parsed.errors.length)throw new Error(parsed.errors.slice(0,8).map(e=>`第 ${e.line} 行：${e.message}`).join('\n'));return {parsed};
    } catch(e){return {error:(e as Error).message};}
  },[text,forceJson]);
  const appendPreview=useMemo(()=>{
    if(!preview.content||!target)return {};
    try {const b=banks.find(b=>b.bank.id===target);if(!b)throw new Error('目标题库已不存在');const result=importQuestionBankContent(preview.content.content,b);return {added:result.added,skipped:result.skipped};}
    catch(e){return {error:(e as Error).message};}
  },[preview.content,target,banks]);
  const count=preview.content?.content.questions.length??preview.backup?.bank.questions.length??preview.parsed?.questions.length??0;
  const sameSource=preview.content?banks.filter(b=>b.bank.contentId===preview.content!.content.bank.id):[];
  const requiresConfirm=!!preview.content&&(preview.content.requiresReview||!!preview.content.warnings.length);
  const submit=async()=>{setBusy(true);setError('');try{if(preview.content)await importContent(preview.content.content,target||undefined,name);else if(preview.backup)await restore(preview.backup);else { const b=createBank(text,name.trim()||preview.parsed?.name||'我的新题库');if(name.trim())b.bank.name=name.trim();await imported(b); }}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  return <Modal title="导入题库" subtitle="支持 Markdown / TXT 填空题、混合题库内容包和完整备份。" close={()=>{if(!busy)close();}} wide>
    <button className="file-drop" disabled={busy} onClick={choose}><Upload size={24}/><span><b>选择本地文件</b><small>UTF-8 .md / .txt / .questionbank.json / 备份 .json</small></span><ArrowRight size={18}/></button>
    <div className="import-grid"><label className="field-label import-source-heading" htmlFor="import-text">题目原文 <span>填空使用 {'{{答案}}'}，独占行 --- 分题</span></label><div className="import-source"><textarea id="import-text" className="code-input" value={text} disabled={busy} onChange={e=>{setText(e.target.value);setConfirmed(false);setError('');}}/>
      {!preview.backup&&<><label className="field-label" htmlFor="bank-name">题库名称</label><input id="bank-name" className="text-input" maxLength={120} disabled={busy||!!target} value={name} onChange={e=>setName(e.target.value)} placeholder={preview.content?.content.bank.name||preview.parsed?.name||'我的新题库'}/></>}
      {preview.content&&<><label className="field-label" htmlFor="import-target">导入位置</label><select id="import-target" className="text-input" disabled={busy} value={target} onChange={e=>setTarget(e.target.value)}><option value="">新建题库</option>{banks.map(b=><option key={b.bank.id} value={b.bank.id}>追加到：{b.bank.name}</option>)}</select><p className="muted">相同 ID 且内容相同会跳过；内容冲突时整批停止，不覆盖原题。当前练习队列保持不变。</p></>}
      {!!sameSource.length&&!target&&<p className="inline-error">已导入同来源题库：{sameSource.map(b=>b.bank.name).join('、')}。可在上方选择追加；继续新建会生成另一份独立学习记录。</p>}
    </div><div className="field-label import-preview-heading">导入预览<span>检查题型、数量和内容后确认导入</span></div><div className="import-preview"><h3>{name||preview.content?.content.bank.name||preview.backup?.bank.name||preview.parsed?.name||'我的新题库'}</h3><div className="preview-counts"><span><b>{count}</b> 道题目</span>{preview.parsed&&<span><b>{preview.parsed.blankCount}</b> 个填空</span>}</div>
      {preview.content&&<><div className="question-tags">{questionTypes.map(type=>{const n=preview.content!.content.questions.filter(q=>q.type===type).length;return n?<span key={type}>{questionTypeNames[type]} {n}</span>:null;})}<span>填空总数 {preview.content.content.questions.reduce((n,q)=>n+(q.type==='cloze'?(q.stem.match(/\{\{/g)?.length??0):0),0)}</span><span>知识点 {preview.content.content.knowledgePoints.length}</span></div>{preview.content.content.questions.slice(0,3).map(q=><div className="preview-question" key={q.id}><span>{questionTypeNames[q.type]}</span><p>{q.stem}</p></div>)}{preview.content.warnings.map((w,i)=><p className="muted" key={i}>{w}</p>)}</>}
      {preview.backup&&<p>完整备份：包含题目、统计和练习进度。同 ID 的题库恢复前需要确认覆盖。</p>}
      {preview.content?.requiresReview&&<details className="knowledge-point"><summary>待核对题目与备注</summary>{preview.content.content.questions.filter(q=>q.reviewStatus==='draft'||q.reviewStatus==='needs_review').slice(0,20).map(q=><p key={q.id}><b>{q.label||q.id}</b>：{q.reviewNote||'请在源文件中核对题干、选项、标准答案和依据。'}</p>)}<small className="muted">这里只列出前 20 条备注；完整题目请同时核对源文件，确认后再导入。</small></details>}
      {preview.parsed?.questions.slice(0,3).map((q,i)=><div className="preview-question" key={i}><span>{i+1}</span><p>{q.fragments.map((f,j)=><span key={j}>{f}{j<q.answers.length&&<mark>{q.answers[j][0]}</mark>}</span>)}</p></div>)}
      {appendPreview.added!==undefined&&<p>将新增 {appendPreview.added} 题，跳过 {appendPreview.skipped} 道相同题目。</p>}
      {(preview.error||appendPreview.error||error)&&<p className="parse-errors" role="alert">{preview.error||appendPreview.error||error}</p>}
      {requiresConfirm&&<label className="import-confirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>我已核对待复核题目和上述提示，确认用于练习</label>}
    </div></div><footer className="modal-footer"><button className="text-button" disabled={busy} onClick={()=>{setForceJson(false);setText(sampleText);setName('');setTarget('');}}>试试 20 道示例题</button><div className="button-row"><button className="secondary" disabled={busy} onClick={close}>取消</button><button className="primary" disabled={busy||!count||!!preview.error||!!appendPreview.error||(requiresConfirm&&!confirmed)} onClick={()=>void submit()}>{busy?'正在导入…':preview.backup?'恢复备份':`导入 ${count||''} 道题目`}<ArrowRight size={16}/></button></div></footer>
  </Modal>;
}
