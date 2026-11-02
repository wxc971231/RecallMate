import { describe, expect, it } from 'vitest';
import { assessBlanks, compareAnswer } from '../src/domain/answerMatcher';
import { createBank, validateBundle } from '../src/domain/banks';
import { checkAnswer, parseQuestion } from '../src/domain/parser';
import { practiceAction, startSession } from '../src/domain/practice';
import { defaultSettings, validateSettings } from '../src/domain/settings';
import type { BlankState, Bundle } from '../src/domain/types';

const blank = (value: string): BlankState => ({ value, status:'unjudged', charSources:Array.from(value,()=> 'user') });
const start = (text: string, strict = true) => startSession(createBank(text), 'all', undefined, strict);
const edit = (b: Bundle, index: number, value: string) => practiceAction(b,{type:'edit',index,value});

describe('填空严格模式', () => {
  it('新设置及旧字号/快捷键配置默认开启，原有字号保持', () => {
    expect(defaultSettings.strictBlankOrder).toBe(true);
    expect(validateSettings({schemaVersion:1,uiFontSize:18,practiceFontSize:32})).toMatchObject({uiFontSize:18,practiceFontSize:32,strictBlankOrder:true});
    const {strictBlankOrder: _, ...old} = defaultSettings;
    expect(validateSettings(old).strictBlankOrder).toBe(true);
  });
  it('显式关闭可保存，字符串与空值等错误类型不接受', () => {
    expect(validateSettings({...defaultSettings,strictBlankOrder:false}).strictBlankOrder).toBe(false);
    for (const value of ['true','false',0,1,null]) expect(()=>validateSettings({...defaultSettings,strictBlankOrder:value})).toThrow('严格模式');
  });
  it.each([
    ['甲、乙、丙','丙、甲、乙'],['甲和乙','乙和甲'],['a、b、c 和 d','d 和 c、a、b'],
    ['a、b 和 c、d','d、c 和 b、a'],['甲、甲、乙','乙、甲、甲'],
  ])('严格模式拒绝单空换序：%s → %s；关闭后继续接受', (target,input) => {
    expect(checkAnswer(input,[target],true)).toBe(false);
    expect(compareAnswer(input,[target],true).correct).toBe(false);
    expect(compareAnswer(input,[target],false).correct).toBe(true);
    expect(compareAnswer(target,[target],true).correct).toBe(true);
  });
  it('保留首尾空白容忍、显式合法答案、大小写及标点规则', () => {
    expect(compareAnswer(' 甲、乙 ',['甲、乙'],true).correct).toBe(true);
    expect(compareAnswer('H2O',['H₂O','H2O'],true).correct).toBe(true);
    expect(compareAnswer('乙、甲',['甲、乙','乙、甲'],true).correct).toBe(true);
    for(const [input,target] of [['a','A'],['甲和乙','甲、乙'],['甲 、乙','甲、乙']]) expect(compareAnswer(input,[target],true).correct).toBe(false);
  });
  it('严格顺序仍保留部分正确字符与缺字反馈', () => {
    expect(compareAnswer('甲、错',['甲、乙'],true).chars).toEqual(['correct','correct','incorrect']);
    const incomplete=compareAnswer('甲丙',['甲乙丙'],true);
    expect(incomplete.correct).toBe(false); expect(incomplete.chars).toEqual(['correct','correct']); expect(incomplete.missing).toBe(1);
  });
  it.each(['{{甲}}、{{乙}}','{{甲}} 和 {{乙}}','{{甲}}、{{乙}} 和 {{丙}}'])('并列多空按文档位置匹配，不把错位标为重复：%s', text => {
    const parsed=parseQuestion(text), values=parsed.answers.map(a=>a[0]).reverse().map(blank);
    const strict=assessBlanks(values,parsed,true);
    expect(strict.every(c=>c.correct)).toBe(false); expect(strict.map(c=>c.targetIndex)).toEqual(parsed.answers.map((_,i)=>i));
    expect(strict.every(c=>!c.duplicate)).toBe(true);
    expect(assessBlanks(values,parsed,false).every(c=>c.correct)).toBe(true);
  });
  it('固定位置仍接受该空的备选答案，不从相邻空借用答案', () => {
    const parsed=parseQuestion('{{甲|A}} 和 {{乙|B}}');
    expect(assessBlanks([blank('A'),blank('B')],parsed,true).every(c=>c.correct)).toBe(true);
    expect(assessBlanks([blank('B'),blank('A')],parsed,true).some(c=>c.correct)).toBe(false);
  });
  it('提示和放弃按原文补字，标准答案映射固定', () => {
    let b=start('{{甲}}、{{乙}} 和 {{丙}}');
    ['丙','甲','乙'].forEach((value,index)=>{b=edit(b,index,value)});
    b=practiceAction(b,{type:'submit'}); b=practiceAction(b,{type:'hint'});
    expect(b.session!.currentAttempt!.blanks.map(x=>x.value)).toEqual(['甲','甲','乙']);
    b=practiceAction(b,{type:'give-up'});
    expect(b.session!.currentAttempt!.blanks.map(x=>x.value)).toEqual(['甲','乙','丙']);
    expect(b.bank.stats[b.bank.questions[0].id]).toMatchObject({wrongAttemptCount:1,helpAttemptCount:1});
  });
  it('一个空内换序的答案也按原文补全', () => {
    let b=edit(start('{{a、b、c 和 d}}'),0,'d 和 c、a、b');
    b=practiceAction(b,{type:'give-up'});
    expect(b.session!.currentAttempt!.blanks[0].value).toBe('a、b、c 和 d');
  });
  it('切换设置不追溯改变当前题，下题按新设置；完成后提交切题也遵守设置', () => {
    let b=edit(start('{{甲、乙}}\n---\n{{甲、乙}}\n---\n{{甲、乙}}'),0,'乙、甲');
    b=practiceAction(b,{type:'submit'},false);
    expect(b.session!.currentAttempt!.strictBlankOrder).toBe(true); expect(b.session!.currentAttempt!.status).toBe('active');
    b=practiceAction(b,{type:'next'},false);
    b=practiceAction(edit(b,0,'乙、甲'),{type:'submit'},true);
    expect(b.session!.currentAttempt!.status).toBe('completed');
    b=practiceAction(b,{type:'submit'},true);
    expect(b.session!.currentAttempt!.strictBlankOrder).toBe(true);
  });
  it('严格作答保存恢复后仍按原模式，不丢失错次或求助标记', () => {
    let b=practiceAction(edit(start('{{甲、乙}}'),0,'乙、甲'),{type:'submit'});
    b=validateBundle(JSON.parse(JSON.stringify(b)));
    expect(b.session!.currentAttempt!.strictBlankOrder).toBe(true);
    b=practiceAction(b,{type:'submit'},false);
    expect(b.session!.currentAttempt!.status).toBe('active'); expect(b.bank.stats[b.bank.questions[0].id].wrongAttemptCount).toBe(1);
  });
  it('没有规则字段的旧版已完成作答保留原判定，新题才使用严格模式', () => {
    let b=practiceAction(edit(start('{{甲、乙}}\n---\n{{甲、乙}}',false),0,'乙、甲'),{type:'submit'});
    expect(b.session!.currentAttempt!.strictBlankOrder).toBeUndefined();
    b=validateBundle(JSON.parse(JSON.stringify(b)));
    expect(b.session!.currentAttempt!.status).toBe('completed');
    b=practiceAction(b,{type:'next'},true);
    expect(b.session!.currentAttempt!.strictBlankOrder).toBe(true);
  });
  it('非法作答规则字段不作为有效备份导入', () => {
    const b=start('{{甲}}'); (b.session!.currentAttempt! as any).strictBlankOrder='true';
    expect(()=>validateBundle(b)).toThrow('顺序规则');
  });
});
