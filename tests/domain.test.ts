import { describe, expect, it } from 'vitest';
import { checkAnswer, parseQuestion, parseQuestionFile } from '../src/domain/parser';
import { createBank, deleteQuestion, dismissWrongQuestion, validateBundle } from '../src/domain/banks';
import { applyHint, practiceAction, reconcileSources, sortWrongQuestions, startSession } from '../src/domain/practice';
import { sampleText } from '../src/sample';
import type { Bundle } from '../src/domain/types';

const bank = () => createBank('# 测试\n第一题{{甲|A}}和{{乙}}。\n---\n第二题{{实事求是}}。');
const edit = (b: Bundle, index: number, value: string) => practiceAction(b, { type: 'edit', index, value });
const submit = (b: Bundle) => practiceAction(b, { type: 'submit' });
const next = (b: Bundle) => practiceAction(b, { type: 'next' });

describe('题库解析与校验', () => {
  it('解析 BOM、CRLF、多答案、多空与跨行题目', () => {
    const result = parseQuestionFile('\uFEFF# 生物\r\n\r\n第一行{{ 甲 | A }}\r\n第二行{{乙}}\r\n---\r\n第三题{{丙}}');
    expect(result.name).toBe('生物'); expect(result.errors).toEqual([]);
    expect(result.questions).toHaveLength(2); expect(result.blankCount).toBe(3);
    expect(result.questions[0].answers).toEqual([['甲', 'A'], ['乙']]);
    expect(result.questions[0].fragments[1]).toContain('\n');
  });
  it.each(['', '   \n', '普通文字', '{{}}', '{{甲|}}', '{{|甲}}', '{{甲', '甲}}', '{{甲{{乙}}}}'])('拒绝无效格式 %j', text => {
    expect(parseQuestionFile(text).errors.length).toBeGreaterThan(0);
  });
  it('错误指向真实文件行号', () => {
    const result = parseQuestionFile('# 测试\n\n正常{{甲}}\n---\n\n错误{{}}');
    expect(result.errors[0]).toMatchObject({ question: 2, line: 6 });
  });
  it('连续分隔符和尾部空白不产生空题', () => expect(parseQuestionFile('---\n---\n{{甲}}\n---\n').questions).toHaveLength(1));
  it('示例题库真实包含 20 道可练习题目', () => {
    const result = parseQuestionFile(sampleText); expect(result.errors).toEqual([]); expect(result.questions).toHaveLength(20);
  });
  it('保留普通空行，不自动分题', () => expect(parseQuestion('{{甲}}\n\n{{乙}}').answers).toHaveLength(2));
  it('只去除首尾空白，其他变体必须显式列出', () => {
    expect(checkAnswer(' A ', ['A'])).toBe(true); expect(checkAnswer('a', ['A'])).toBe(false);
    expect(checkAnswer('AB', ['A B'])).toBe(false); expect(checkAnswer('Ａ', ['A'])).toBe(false);
    expect(checkAnswer('H2O', ['H₂O', 'H2O'])).toBe(true);
  });
  it('备份能往返校验，重复 ID 与悬空引用会拒绝', () => {
    const b = bank(); expect(validateBundle(JSON.parse(JSON.stringify(b)))).toEqual(b);
    const duplicate = structuredClone(b); duplicate.bank.questions.push(duplicate.bank.questions[0]);
    expect(() => validateBundle(duplicate)).toThrow('重复');
    const session = startSession(b, 'all'); session.session!.questionIds.push(crypto.randomUUID());
    expect(() => validateBundle(session)).toThrow('队列');
  });
  it('未知 schema、路径式 ID、错误字符来源与状态会拒绝', () => {
    expect(() => validateBundle({ ...bank(), schemaVersion: 2 })).toThrow('版本');
    const invalid = bank(); invalid.bank.id = '../escape'; expect(() => validateBundle(invalid)).toThrow('标识');
    const b = startSession(bank(), 'all'); b.session!.currentAttempt!.blanks[0].charSources = ['user'];
    expect(() => validateBundle(b)).toThrow('字符来源');
  });
});

describe('练习状态与统计', () => {
  it('逐空判题，完成后保留反馈，再次回车才切题', () => {
    let b = startSession(bank(), 'all');
    b = submit(edit(b, 0, 'A')); expect(b.session!.currentAttempt!.activeBlankIndex).toBe(1);
    b = submit(edit(b, 1, '乙')); expect(b.session!.currentAttempt!.status).toBe('completed');
    expect(b.session!.currentIndex).toBe(0); expect(b.bank.stats[b.bank.questions[0].id].independentCorrectCount).toBe(1);
    b = submit(b); expect(b.session!.currentIndex).toBe(1); expect(b.session!.summaries).toHaveLength(1);
  });
  it('多次答错、多次求助只各累计一次', () => {
    let b = startSession(bank(), 'all'); const id = b.bank.questions[0].id;
    b = submit(edit(b, 0, '错')); b = submit(b); b = submit(b);
    b = practiceAction(b, { type: 'hint' }); b = practiceAction(b, { type: 'view' }); b = practiceAction(b, { type: 'view' });
    expect(b.bank.stats[id]).toMatchObject({ attemptCount: 1, wrongAttemptCount: 1, helpAttemptCount: 1, inWrongBook: true, independentCorrectCount: 0 });
    expect(validateBundle(b)).toBe(b);
  });
  it('修改已正确的空恢复待判定，并从左寻找第一个未通过空', () => {
    let b = startSession(bank(), 'all'); b = submit(edit(b, 0, '甲'));
    b = edit(b, 0, '错'); expect(b.session!.currentAttempt!.blanks[0].status).toBe('unjudged');
    b = submit(edit(b, 1, '乙')); expect(b.session!.currentAttempt!.activeBlankIndex).toBe(0);
  });
  it('完成后修改可撤回独立完成统计，不重复计入 Attempt', () => {
    let b = startSession(bank(), 'all'); const id = b.bank.questions[0].id;
    b = submit(edit(b, 0, '甲')); b = submit(edit(b, 1, '乙'));
    expect(b.bank.stats[id].independentCorrectCount).toBe(1);
    b = edit(b, 0, '错'); expect(b.session!.currentAttempt!.status).toBe('active');
    expect(b.bank.stats[id].independentCorrectCount).toBe(0);
    b = submit(b); b = submit(edit(b, 0, '甲'));
    expect(b.bank.stats[id]).toMatchObject({ attemptCount: 1, wrongAttemptCount: 1, independentCorrectCount: 0 });
  });
  it('纯跳过不进入错题本，错误或求助后跳过会保留记录', () => {
    let b = startSession(bank(), 'all'); const ids = b.bank.questions.map(q => q.id);
    b = next(b); expect(b.bank.stats[ids[0]].inWrongBook).toBe(false);
    b = practiceAction(b, { type: 'view' }); b = next(b);
    expect(b.session!.isFinished).toBe(true); expect(b.session!.summaries.filter(s => s.skipped)).toHaveLength(2);
    expect(b.bank.stats[ids[1]].inWrongBook).toBe(true); expect(validateBundle(b)).toBe(b);
  });
  it('放弃保留正确的合法变体，补写来源高亮且锁定输入', () => {
    let b = startSession(bank(), 'all'); b = submit(edit(b, 0, 'A'));
    b = practiceAction(b, { type: 'give-up' }); const a = b.session!.currentAttempt!;
    expect(a.status).toBe('abandoned'); expect(a.blanks[0].value).toBe('A'); expect(a.blanks[1].charSources).toEqual(['give_up']);
    expect(edit(b, 0, '乱写')).toBe(b); expect(b.bank.stats[a.questionId].independentCorrectCount).toBe(0);
    expect(practiceAction(b, { type: 'give-up' })).toBe(b);
  });
  it('提示补满后仍需 Enter，下一次提示跳到下一个未补满空', () => {
    let b = startSession(bank(), 'all'); b = practiceAction(b, { type: 'hint' });
    expect(b.session!.currentAttempt!.blanks[0]).toMatchObject({ value: '甲', status: 'unjudged', charSources: ['hint'] });
    b = practiceAction(b, { type: 'hint' }); expect(b.session!.currentAttempt!.blanks[1].value).toBe('乙');
    expect(b.session!.currentAttempt!.status).toBe('active');
  });
  it('查看答案不会覆盖原输入、判题状态、字符来源或焦点', () => {
    let b = startSession(bank(), 'all'); b = edit(b, 1, '猜测');
    const a = structuredClone(b.session!.currentAttempt!); b = practiceAction(b, { type: 'view' });
    expect(b.session!.currentAttempt!.blanks).toEqual(a.blanks); expect(b.session!.currentAttempt!.activeBlankIndex).toBe(1);
  });
  it('Unicode 提示不截断代理对，错误尾部被删除', () => {
    expect(applyHint({ value: '', status: 'unjudged', charSources: [] }, '😀实事').value).toBe('😀');
    expect(applyHint({ value: '实事求似', status: 'incorrect', charSources: ['user','user','user','user'] }, '实事求是')).toEqual({ value: '实事求是', status: 'unjudged', charSources: ['user','user','user','hint'] });
  });
  it('编辑中插入、替换、删除字符时保留未修改提示的来源', () => {
    const blank = { value: '😀甲乙', status: 'unjudged' as const, charSources: ['hint', 'user', 'hint'] as const };
    expect(reconcileSources({ ...blank, charSources: [...blank.charSources] }, '😀新甲乙')).toEqual(['hint','user','user','hint']);
    expect(reconcileSources({ ...blank, charSources: [...blank.charSources] }, '😀乙')).toEqual(['hint','hint']);
  });
  it('会话恢复保留输入、字符来源、队列、统计，不重复结算', () => {
    let b = startSession(bank(), 'all'); b = practiceAction(b, { type: 'hint' });
    b = validateBundle(JSON.parse(JSON.stringify(b))); b = submit(b); b = submit(edit(b, 1, '乙')); b = next(b);
    expect(b.session!.summaries).toHaveLength(1); expect(b.bank.stats[b.bank.questions[0].id].helpAttemptCount).toBe(1);
  });
  it('当前练习队列不会因错题排序变化而改变', () => {
    let b = startSession(bank(), 'all'); const queue = [...b.session!.questionIds];
    b = submit(edit(b, 0, '错')); expect(b.session!.questionIds).toEqual(queue);
    expect(sortWrongQuestions(b.bank).map(q => q.id)).toEqual([queue[0]]);
  });
  it('移出错题本后继续原作答不会重新加入，新的困难作答仍会加入', () => {
    let b = startSession(bank(), 'all'); const id = b.bank.questions[0].id;
    b = submit(edit(b, 0, '错')); b = dismissWrongQuestion(b, id);
    b = submit(edit(b, 0, '甲')); b = submit(edit(b, 1, '乙'));
    expect(b.bank.stats[id].inWrongBook).toBe(false); expect(b.bank.stats[id].wrongAttemptCount).toBe(1);
    b = startSession(b, 'single', [id]); b = submit(edit(b, 0, '再错'));
    expect(b.bank.stats[id].inWrongBook).toBe(true); expect(b.bank.stats[id].wrongAttemptCount).toBe(2);
  });
  it('20 题完整练习、逐题独立完成及总结可被备份恢复', () => {
    let b = startSession(createBank(sampleText), 'all');
    for (const q of b.bank.questions) {
      const parsed = parseQuestion(q.sourceText);
      parsed.answers.forEach((answers, index) => { b = submit(edit(b, index, answers.at(-1)!)); });
      expect(b.session!.currentAttempt!.status).toBe('completed'); b = next(b);
    }
    expect(b.session!.isFinished).toBe(true); expect(b.session!.summaries.filter(s => s.independent)).toHaveLength(20);
    expect(validateBundle(JSON.parse(JSON.stringify(b)))).toEqual(b);
  });
  it('删除前面的题目会修正队列索引与总结引用', () => {
    let b = next(startSession(bank(), 'all')); const first = b.bank.questions[0].id;
    b = deleteQuestion(b, first); expect(b.session!.currentIndex).toBe(0); expect(b.session!.summaries).toEqual([]);
    expect(validateBundle(b)).toBe(b);
  });
});
