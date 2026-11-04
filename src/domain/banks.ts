import { parseQuestion, parseQuestionFile } from './parser';
import { emptyStats } from './practice';
import { validateLegacyBundle, validId } from './legacy';
import { assertData as assert, isRecord as object, externalId, validateContentQuestion, validateKnowledge } from './questionBankPackage';
import { gradeObjective } from './objectiveGrading';
import type { Attempt, Bundle, ClozeBundle, ClozeQuestion, Question, QuestionStats } from './types';
export { validId } from './legacy';
export class UnsupportedVersionError extends Error {}
const date=(value: unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value));
function stats(value: unknown): value is QuestionStats {
  return object(value)&&['attemptCount','wrongAttemptCount','helpAttemptCount','independentCorrectCount'].every(k=>Number.isSafeInteger(value[k])&&value[k]>=0)&&typeof value.inWrongBook==='boolean'&&(value.lastAttemptAt===undefined||date(value.lastAttemptAt))&&(value.lastDifficultyAt===undefined||date(value.lastDifficultyAt))&&(value.lastDifficultyType===undefined||typeof value.lastDifficultyType==='string');
}
export function createBank(text: string, fallback='未命名题库'): ClozeBundle {
  const parsed=parseQuestionFile(text);if(parsed.errors.length||!parsed.questions.length)throw new Error(parsed.errors[0]?.message??'题库不能为空');
  const timestamp=new Date().toISOString(),id=crypto.randomUUID();
  const questions:ClozeQuestion[]=parsed.questions.map(q=>{const id=crypto.randomUUID();return{id,externalId:`legacy-${id}`,type:'cloze',sourceText:q.sourceText,createdAt:timestamp,updatedAt:timestamp};});
  return{format:'recallmate.backup',schemaVersion:2,bank:{schemaVersion:2,id,contentId:`legacy-${id}`,name:parsed.name||fallback,createdAt:timestamp,updatedAt:timestamp,questions,knowledgePoints:[],stats:Object.fromEntries(questions.map(q=>[q.id,emptyStats()]))}};
}
export function migrateBundleV1(input: unknown): Bundle {
  const legacy=structuredClone(validateLegacyBundle(input));
  return{...legacy,format:'recallmate.backup',schemaVersion:2,bank:{...legacy.bank,schemaVersion:2,contentId:`legacy-${legacy.bank.id}`,knowledgePoints:[],questions:legacy.bank.questions.map(q=>({...q,type:'cloze',externalId:`legacy-${q.id}`}))},...(legacy.session?{session:{...legacy.session,schemaVersion:2,currentAttempt:legacy.session.currentAttempt?{...legacy.session.currentAttempt,questionType:'cloze'}:undefined}}:{session:undefined})};
}
export function validateBundle(input: unknown): Bundle {
  assert(object(input),'题库备份格式无效');
  if((object(input.bank)&&typeof input.bank.schemaVersion==='number'&&input.bank.schemaVersion>2)||(object(input.session)&&typeof input.session.schemaVersion==='number'&&input.session.schemaVersion>2))throw new UnsupportedVersionError('不支持此题库或进度版本，请升级 RecallMate');
  if(input.schemaVersion===1)return validateBundle(migrateBundleV1(input));
  if(input.schemaVersion!==2)throw new UnsupportedVersionError('不支持此备份版本，请使用兼容的 RecallMate 版本');
  assert(input.format==='recallmate.backup','不支持此备份格式或版本');
  const bank=input.bank;
  assert(object(bank)&&bank.schemaVersion===2&&validId(bank.id),'题库标识或版本无效');
  assert(externalId(bank.contentId),'题库内容标识无效');assert(typeof bank.name==='string'&&!!bank.name.trim()&&bank.name.length<=120,'题库名称需为 1–120 个字符');
  assert(date(bank.createdAt)&&date(bank.updatedAt),'题库时间无效');
  assert(bank.description===undefined||(typeof bank.description==='string'&&bank.description.length<=100000),'题库简介无效');
  assert(Array.isArray(bank.knowledgePoints)&&bank.knowledgePoints.length<=10000,'知识点列表无效');
  const knowledge=new Set<string>();for(const raw of bank.knowledgePoints){const point=validateKnowledge(raw);assert(!knowledge.has(point.id),'知识点 ID 重复');knowledge.add(point.id);}
  assert(Array.isArray(bank.questions)&&bank.questions.length<=10000,'题目数量无效，最多支持一万题');
  const ids=new Set<string>(),externalIds=new Set<string>(),questions=new Map<string,any>();
  for(const q of bank.questions){
    assert(object(q)&&validId(q.id)&&!ids.has(q.id),'题目 ID 无效或重复');
    assert(typeof q.sourceText==='string'&&q.sourceText.length<=100000&&date(q.createdAt)&&date(q.updatedAt),'题目内容或时间无效');
    validateContentQuestion({...q,id:q.externalId,stem:q.sourceText});assert(!externalIds.has(q.externalId),'题目外部 ID 重复');externalIds.add(q.externalId);
    for(const ref of q.knowledgeRefs??[])assert(knowledge.has(ref),'题目引用了不存在的知识点');
    ids.add(q.id);questions.set(q.id,q);
  }
  assert(object(bank.stats),'缺少题目统计');
  for(const [id,entry] of Object.entries(bank.stats))assert(ids.has(id)&&stats(entry),'统计内容无效或引用了不存在的题目');
  for(const id of ids)assert(stats(bank.stats[id]),'部分题目缺少统计');
  if(input.session!==undefined){
    const s=input.session;
    assert(object(s)&&s.schemaVersion===2&&s.bankId===bank.id&&validId(s.sessionId),'练习进度标识无效');
    assert(['all','random','wrong','single','round-wrong'].includes(s.mode),'练习模式无效');
    assert(Array.isArray(s.questionIds)&&s.questionIds.length>0&&s.questionIds.every((id:unknown)=>typeof id==='string'&&ids.has(id))&&new Set(s.questionIds).size===s.questionIds.length,'练习队列包含无效或重复的题目');
    assert(Number.isInteger(s.currentIndex)&&s.currentIndex>=0&&s.currentIndex<=s.questionIds.length&&typeof s.isFinished==='boolean','练习位置无效');
    assert(s.isFinished===(s.currentIndex===s.questionIds.length)&&date(s.startedAt)&&date(s.updatedAt),'练习状态或时间无效');
    assert(Array.isArray(s.summaries)&&s.summaries.length===s.currentIndex,'本轮统计与练习进度不一致');
    const attempts=new Set<string>();
    s.summaries.forEach((v:any,i:number)=>{assert(object(v)&&validId(v.attemptId)&&!attempts.has(v.attemptId)&&v.questionId===s.questionIds[i],'本轮统计引用无效');assert(['independent','wrong','help','skipped'].every(k=>typeof v[k]==='boolean'),'本轮统计字段无效');attempts.add(v.attemptId);});
    if(!s.isFinished){
      const a=s.currentAttempt as Attempt;
      assert(object(a)&&validId(a.id)&&!attempts.has(a.id)&&a.questionId===s.questionIds[s.currentIndex],'当前作答无效');
      const q=questions.get(a.questionId);assert(a.questionType===q.type,'作答与题目类型不一致');
      assert(stats(a.beforeStats)&&date(a.startedAt)&&(a.endedAt===undefined||date(a.endedAt))&&(a.difficultyAt===undefined||date(a.difficultyAt)),'作答统计或时间无效');
      assert(a.difficultyType===undefined||typeof a.difficultyType==='string','困难类型无效');assert(a.wrongBookDismissed===undefined||typeof a.wrongBookDismissed==='boolean','错题移出标记无效');
      assert(['hadWrongSubmission','usedHint','viewedAnswer','gaveUp'].every(k=>typeof (a as any)[k]==='boolean'),'作答标记无效');
      if(a.questionType==='cloze'){
        assert(['active','completed','abandoned'].includes(a.status),'填空作答状态无效');
        assert(a.strictBlankOrder===undefined||typeof a.strictBlankOrder==='boolean','填空顺序规则无效');
        const parsed=parseQuestion(q.sourceText);
        assert(Array.isArray(a.blanks)&&a.blanks.length===parsed.answers.length&&Number.isInteger(a.activeBlankIndex)&&a.activeBlankIndex>=0&&a.activeBlankIndex<a.blanks.length,'填空位置无效');
        for(const b of a.blanks)assert(object(b)&&typeof b.value==='string'&&b.value.length<=100000&&['unjudged','correct','partial','incorrect'].includes(b.status)&&Array.isArray(b.charSources)&&b.charSources.length===Array.from(b.value).length&&b.charSources.every(c=>['user','hint','give_up'].includes(c)),'填空内容或字符来源无效');
        assert(a.status!=='completed'||a.blanks.every(b=>b.status==='correct'),'完成状态与填空状态不一致');
      }else{
        assert(['active','submitted','abandoned'].includes(a.status)&&!('blanks' in a),'客观题作答状态无效');
        if(a.questionType==='true_false')assert(a.selectedAnswer===null||typeof a.selectedAnswer==='boolean','判断选择无效');
        else if(a.questionType==='single_choice')assert(a.selectedAnswer===null||(typeof a.selectedAnswer==='string'&&q.options.some((o:any)=>o.id===a.selectedAnswer)),'单选选择无效');
        else assert(Array.isArray(a.selectedAnswer)&&new Set(a.selectedAnswer).size===a.selectedAnswer.length&&a.selectedAnswer.every(id=>q.options.some((o:any)=>o.id===id)),'多选选择无效');
        const result=gradeObjective(q,a.selectedAnswer);
        assert(a.status!=='submitted'||(!result.empty&&a.hadWrongSubmission===!result.correct&&date(a.endedAt)),'客观题结果与统计标记不一致');
        assert(a.status!=='active'||(!a.hadWrongSubmission&&!a.viewedAnswer&&!a.gaveUp),'未提交客观题的统计标记无效');
        assert(a.status!=='abandoned'||((a.viewedAnswer||a.gaveUp)&&!a.hadWrongSubmission&&date(a.endedAt)),'查看答案状态无效');
        assert(!a.usedHint,'客观题不支持逐字提示');
      }
    }else assert(s.currentAttempt===undefined,'已结束的练习不应有当前作答');
  }
  return input as Bundle;
}

export function validateClozeBundle(input: unknown): ClozeBundle {
  const bundle=validateBundle(input);
  assert(bundle.bank.questions.every(q=>q.type==='cloze')&&(!bundle.session?.currentAttempt||bundle.session.currentAttempt.questionType==='cloze'),'此测试／入口仅接受填空题库');
  return bundle as ClozeBundle;
}

export function deleteQuestion<Q extends Question, A extends Attempt>(bundle: Bundle<Q, A>, questionId: string): Bundle<Q, A> {
  const bank = { ...bundle.bank, updatedAt: new Date().toISOString(), questions: bundle.bank.questions.filter(q => q.id !== questionId), stats: { ...bundle.bank.stats } };
  delete bank.stats[questionId];
  const s = bundle.session;
  if (!s || !s.questionIds.includes(questionId)) return { ...bundle, bank };
  const beforeCurrent = s.questionIds.slice(0, s.currentIndex).filter(id => id !== questionId).length;
  const questionIds = s.questionIds.filter(id => id !== questionId);
  if (!questionIds.length) return { format: 'recallmate.backup', schemaVersion: 2, bank };
  const isFinished = beforeCurrent >= questionIds.length;
  // Deleting the current question invalidates its draft; a new session may be started explicitly.
  if (s.currentAttempt?.questionId === questionId) return { format: 'recallmate.backup', schemaVersion: 2, bank };
  return { ...bundle, bank, session: { ...s, questionIds, currentIndex: beforeCurrent, summaries: s.summaries.filter(x => x.questionId !== questionId), isFinished } };
}

export function dismissWrongQuestion<Q extends Question, A extends Attempt>(bundle: Bundle<Q, A>, id: string): Bundle<Q, A> {
  const bank = { ...bundle.bank, updatedAt: new Date().toISOString(), stats: { ...bundle.bank.stats, [id]: { ...bundle.bank.stats[id], inWrongBook: false } } };
  const session = bundle.session;
  if (session?.currentAttempt?.questionId !== id) return { ...bundle, bank };
  const attempt = session.currentAttempt;
  return { ...bundle, bank, session: { ...session, currentAttempt: { ...attempt, wrongBookDismissed: true, beforeStats: { ...attempt.beforeStats, inWrongBook: false } } } };
}
