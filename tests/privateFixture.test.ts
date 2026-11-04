import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { importQuestionBankContent, validateQuestionBankPackage } from '../src/domain/questionBankPackage';
import { practiceAction, startSession } from '../src/domain/practice';
import { validateBundle } from '../src/domain/banks';

// Optional local acceptance material. Never includes user documents in the public repo or CI.
const file=process.env.RECALLMATE_PRIVATE_FIXTURE;
describe.skipIf(!file||!existsSync(file))('用户授权的本地 50 题验收',()=>{
  it('题型比例、80 空、105 知识点、原题号和两个六选全选题',()=>{
    const p=validateQuestionBankPackage(JSON.parse(readFileSync(file!,'utf8')));
    expect(p.questions).toHaveLength(50);expect(p.knowledgePoints).toHaveLength(105);
    expect(['cloze','true_false','single_choice','multiple_choice'].map(t=>p.questions.filter(q=>q.type===t).length)).toEqual([20,10,12,8]);
    expect(p.questions.reduce((sum,q)=>sum+(q.stem.match(/\{\{/g)?.length??0),0)).toBe(80);expect(p.questions.some(q=>q.id==='fill-014')).toBe(false);
    expect(p.questions.filter(q=>q.type==='multiple_choice'&&q.options.length===6&&q.answer.length===6)).toHaveLength(2);
    expect(p.questions.filter(q=>q.type!=='cloze'&&!!q.explanation)).toHaveLength(30);
    expect(p.questions.filter(q=>q.type==='true_false').every(q=>q.explanation?.startsWith('根据知识点 '))).toBe(true);
    for(const q of p.questions)if(q.type==='single_choice'||q.type==='multiple_choice')expect(q.explanation?.match(/^- [A-Z]：/gm)).toHaveLength(q.options.length);
    expect(p.questions.every(q=>!q.explanation||!q.explanation.includes('解析沿用本测试材料的范围'))).toBe(true);
  });
  it('逐题作答并恢复，完成混合轮次后所有统计只计一次',()=>{
    const p=validateQuestionBankPackage(JSON.parse(readFileSync(file!,'utf8')));let b=startSession(importQuestionBankContent(p).bundle,'all',undefined,true);
    for(const q of b.bank.questions){
      if(q.type==='cloze'){
        const answers=[...q.sourceText.matchAll(/\{\{([^{}]+)\}\}/g)].map(m=>m[1].split('|')[0]);
        for(const [index,value] of answers.entries()){b=practiceAction(b,{type:'edit',index,value});b=practiceAction(b,{type:'submit'});}
        expect(b.session!.currentAttempt!.status).toBe('completed');
      }else{b=practiceAction(b,{type:'select',value:q.answer});b=validateBundle(JSON.parse(JSON.stringify(b)));b=practiceAction(b,{type:'submit'});expect(b.session!.currentAttempt!.status).toBe('submitted');}
      b=validateBundle(JSON.parse(JSON.stringify(b)));expect(b.bank.stats[q.id]).toMatchObject({attemptCount:1,independentCorrectCount:1,wrongAttemptCount:0,helpAttemptCount:0});b=practiceAction(b,{type:'next'});
    }
    expect(b.session!.isFinished).toBe(true);expect(b.session!.summaries).toHaveLength(50);expect(b.session!.summaries.every(s=>s.independent)).toBe(true);
  });
});
