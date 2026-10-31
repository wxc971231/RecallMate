import { describe, expect, it } from 'vitest';
import { assessBlanks, answerGroups, compareAnswer, compareText, feedbackLabel, matchesAnswer } from '../src/domain/answerMatcher';
import { createBank, validateBundle } from '../src/domain/banks';
import { checkAnswer, parseQuestion } from '../src/domain/parser';
import { applyHint, practiceAction, startSession } from '../src/domain/practice';
import type { BlankState, Bundle } from '../src/domain/types';

const blank = (value: string, status: BlankState['status'] = 'unjudged'): BlankState => ({ value, status, charSources: Array.from(value).map(() => 'user') });
const start = (text: string) => startSession(createBank(text), 'all');
const edit = (b: Bundle, index: number, value: string) => practiceAction(b, { type: 'edit', index, value });
const submit = (b: Bundle) => practiceAction(b, { type: 'submit' });

describe('字符差异与部分正确', () => {
  it('替换错误只标红错字', () => {
    const c = compareText('实事求似', '实事求是');
    expect(c.correct).toBe(false); expect(c.chars).toEqual(['correct', 'correct', 'correct', 'incorrect']); expect(feedbackLabel(c)).toBe('部分正确');
  });
  it('缺字仍保留后面正确的字，不透露缺失答案', () => {
    const c = compareText('叶体', '叶绿体'); expect(c.chars).toEqual(['correct', 'correct']); expect(c.missing).toBe(1); expect(feedbackLabel(c)).toBe('尚未完整');
  });
  it('多字只标红多余字符', () => expect(compareText('叶绿错体', '叶绿体').chars).toEqual(['correct', 'correct', 'incorrect', 'correct']));
  it('只去掉首尾空白，内部空白与大小写仍严格判定', () => {
    expect(compareText(' A ', 'A').chars).toEqual(['neutral', 'correct', 'neutral']); expect(checkAnswer(' A ', ['A'])).toBe(true);
    expect(checkAnswer('a', ['A'])).toBe(false); expect(checkAnswer('A B', ['AB'])).toBe(false);
  });
  it('Unicode 高亮按字符而非 UTF-16 半个代理对计算', () => expect(compareText('😀错好', '😀你好').chars).toEqual(['correct', 'incorrect', 'correct']));
  it('多答案优先完整合法答案，否则选择最接近的一项', () => {
    expect(compareAnswer('H2O', ['H₂O', 'H2O']).correct).toBe(true);
    expect(compareAnswer('H2X', ['H₂O', 'H2O']).chars).toEqual(['correct', 'correct', 'incorrect']);
  });
  it('长答案差异不会分配无界矩阵，完全匹配仍准确', () => {
    expect(compareText('甲'.repeat(1000), '乙'.repeat(1000)).correct).toBe(false);
    expect(compareText('😀'.repeat(1000), '😀'.repeat(1000)).chars).toHaveLength(1000);
  });
});

describe('一个空内的无序顿号列表', () => {
  it.each(['甲、乙、丙', '丙、甲、乙', '乙、丙、甲', ' 乙 、 甲 、 丙 '])('合法顺序 %s 均通过', input => expect(checkAnswer(input, ['甲、乙、丙'])).toBe(true));
  it.each(['甲、甲、丙', '甲、乙', '甲、乙、丙、丁', '甲、乙、', '甲，，乙，丙'])('重复、缺失、多余、空项或其他分隔符不通过 %s', input => expect(checkAnswer(input, ['甲、乙、丙'])).toBe(false));
  it('保留重复标准答案的数量要求', () => { expect(matchesAnswer('乙、甲、甲', ['甲、甲、乙'])).toBe(true); expect(matchesAnswer('乙、甲', ['甲、甲、乙'])).toBe(false); });
  it('匹配整项后，对剩余项目再逐字高亮', () => {
    const c = compareAnswer('机密、绝蜜、秘密', ['绝密、机密、秘密']);
    expect(c.chars).toEqual(['correct','correct','neutral','correct','incorrect','neutral','correct','correct']);
    expect(c.target).toBe('机密、绝密、秘密');
  });
  it('已有项目正确但缺少项目时，只有缺失提示', () => { const c = compareAnswer('丙、甲', ['甲、乙、丙']); expect(c.chars).not.toContain('incorrect'); expect(c.correct).toBe(false); expect(c.missing).toBeGreaterThan(0); });
  it('多个合法完整列表不能混合拼出一个新答案', () => expect(checkAnswer('甲、丁', ['甲、乙', '丙、丁'])).toBe(false));
});

describe('顿号相连的多个空', () => {
  it('顿号与和相连的空组成同一组，不跨越句子', () => expect(answerGroups(parseQuestion('{{甲}}、 {{乙}}和{{丙}}；{{丁}}。{{戊}}'))).toEqual([[0,1,2],[3],[4]]));
  it('反序填写后每个空独立提交可以完成', () => {
    let b = start('{{甲}}、{{乙}}、{{丙}}');
    b = submit(edit(b, 0, '丙')); b = submit(edit(b, 1, '甲')); b = submit(edit(b, 2, '乙'));
    expect(b.session!.currentAttempt!.status).toBe('completed'); expect(b.bank.stats[b.bank.questions[0].id].independentCorrectCount).toBe(1);
  });
  it('重复项不能挤掉之前已经判对的答案', () => {
    let b = start('{{甲}}、{{乙}}'); b = submit(edit(b, 0, '乙')); b = submit(edit(b, 1, '乙'));
    expect(b.session!.currentAttempt!.blanks[0].status).toBe('correct'); expect(b.session!.currentAttempt!.blanks[1].status).not.toBe('correct');
    expect(assessBlanks(b.session!.currentAttempt!.blanks, parseQuestion(b.bank.questions[0].sourceText))[1].duplicate).toBe(true);
  });
  it('重叠合法答案需要全组分配，避免贪心假错误', () => {
    let b = start('{{甲|乙}}、{{甲}}'); b = submit(edit(b, 0, '甲')); b = submit(edit(b, 1, '乙'));
    expect(b.session!.currentAttempt!.status).toBe('completed');
  });
  it('输入未提交的重复值，不改变已判对的空', () => {
    let b = start('{{甲}}、{{乙}}'); b = submit(edit(b, 0, '乙')); b = edit(b, 1, '乙');
    expect(b.session!.currentAttempt!.blanks.map(x => x.status)).toEqual(['correct', 'unjudged']);
  });
  it('修改已判对的空，会释放其占用的选项', () => {
    let b = start('{{甲}}、{{乙}}'); b = submit(edit(b, 0, '乙')); b = submit(edit(b, 1, '乙'));
    b = edit(b, 0, '甲'); expect(b.session!.currentAttempt!.blanks[0].status).toBe('unjudged');
    expect(b.session!.currentAttempt!.blanks[1].status).toBe('correct'); b = submit(b); expect(b.session!.currentAttempt!.status).toBe('completed');
  });
  it('不跨组接受答案', () => { let b = start('{{甲}}、{{乙}}；{{丙}}'); b = submit(edit(b, 0, '丙')); expect(b.session!.currentAttempt!.blanks[0].status).not.toBe('correct'); });
  it('一个空内的无序列表与跨空换序可以叠加', () => { let b = start('{{甲、乙}}、{{丙、丁}}'); b = submit(edit(b, 0, '丁、丙')); b = submit(edit(b, 1, '乙、甲')); expect(b.session!.currentAttempt!.status).toBe('completed'); });
  it('大组同样可以处理重叠别名', () => {
    const text = ['{{甲|乙}}', '{{甲}}', ...Array.from({ length: 48 }, (_, i) => '{{项' + i + '}}')].join('、');
    const parsed = parseQuestion(text), values = [blank('甲'), blank('乙'), ...Array.from({ length: 48 }, (_, i) => blank('项' + i))];
    expect(assessBlanks(values, parsed).every(c => c.correct)).toBe(true);
  });
  it('重叠备选的所有三项组合与独立枚举结果一致', () => {
    const parsed = parseQuestion('{{甲|乙}}、{{乙|丙}}、{{甲}}');
    const permutations = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
    for (const a of ['甲','乙','丙']) for (const b of ['甲','乙','丙']) for (const c of ['甲','乙','丙']) {
      const values = [a,b,c];
      const expected = permutations.some(order => values.every((value, i) => parsed.answers[order[i]].includes(value)));
      expect(assessBlanks(values.map(value => blank(value)), parsed).every(result => result.correct)).toBe(expected);
      let bundle = start('{{甲|乙}}、{{乙|丙}}、{{甲}}');
      values.forEach((value, i) => { bundle = submit(edit(bundle, i, value)); });
      expect(bundle.session!.currentAttempt!.status === 'completed').toBe(expected);
    }
  });
  it('大列表部分匹配的重复项目也不会无限递归', () => {
    const target = [...Array(1000).fill('甲'), '乙'].join('、');
    const input = Array(1001).fill('甲').join('、');
    expect(compareAnswer(input, [target]).correct).toBe(false);
    expect(compareAnswer(input, [target]).duplicate).toBe(true);
  });
});

describe('和连接及混合并列', () => {
  it.each([
    ['甲和乙', '乙和甲'], ['甲 和 乙', '乙、甲'],
    ['a、b、c 和 d', 'd、a、b和c'], ['a、b、c和d', 'c和d、b、a'],
    ['甲和乙和丙', '丙、甲和乙'], ['甲、乙、丙 和 丁', '丁、丙、甲和乙'],
    ['和平、发展和合作', '合作和发展、和平'], ['中华人民共和国 和 国务院', '国务院和中华人民共和国'],
  ])('单空混合列表 %s 接受 %s', (target, input) => expect(compareAnswer(input, [target]).correct).toBe(true));
  it.each(['和平', '和谐', '中华人民共和国', '共和国', '温和', '调和级数', '总和'])('普通词语 %s 不被和拆开', word => {
    expect(compareAnswer(word, [word]).correct).toBe(true);
    const fragments = word.split('和');
    if (fragments.every(Boolean)) expect(compareAnswer(fragments.reverse().join('和'), [word]).correct).toBe(false);
  });
  it('连接词带空格可明确区分普通词边界', () => expect(compareAnswer('平台 和 甲', ['甲 和 平台']).correct).toBe(true));
  it('混合列表漏项、重复和多余项仍不通过', () => {
    for (const input of ['a、b和c', 'a、a、c和d', 'a、b、c、d和e', 'a、b、c和']) expect(compareAnswer(input, ['a、b、c 和 d']).correct).toBe(false);
  });
  it('混合连接的四个空支持全部 24 种排列', () => {
    const permutations = (items: string[]): string[][] => items.length ? items.flatMap((item, i) => permutations(items.filter((_, j) => i !== j)).map(rest => [item, ...rest])) : [[]];
    for (const order of permutations(['a','b','c','d'])) {
      let bundle = start('{{a}}、{{b}}、{{c}} 和 {{d}}');
      order.forEach((value, i) => { bundle = submit(edit(bundle, i, value)); });
      expect(bundle.session!.currentAttempt!.status).toBe('completed');
      expect(bundle.bank.stats[bundle.bank.questions[0].id].independentCorrectCount).toBe(1);
    }
  });
  it('混合单空的字符高亮保留连接词中性并只标错字', () => {
    const result = compareAnswer('合作 和 发错、和平', ['和平、发展和合作']);
    expect(result.correct).toBe(false); expect(result.chars[3]).toBe('neutral');
    expect(result.chars[6]).toBe('incorrect'); expect(result.target).toBe('合作 和 发展、和平');
  });
  it('提示保留用户的连接形式及正确项目', () => {
    expect(applyHint(blank('合作 和 发错、和平'), '和平、发展和合作').value).toBe('合作 和 发展、和平');
  });
  it('跨空提示和放弃不会重复用混合组中已有的项目', () => {
    let b = start('{{a}}、{{b}}、{{c}} 和 {{d}}');
    b = submit(edit(b, 0, 'd')); b = submit(edit(b, 1, 'c')); b = submit(edit(b, 2, 'b'));
    b = practiceAction(b, { type: 'hint' }); expect(b.session!.currentAttempt!.blanks.map(x => x.value)).toEqual(['d','c','b','a']);
    b = practiceAction(b, { type: 'give-up' }); expect(b.session!.currentAttempt!.blanks.map(x => x.value)).toEqual(['d','c','b','a']);
  });
});

describe('部分反馈、提示、统计与恢复', () => {
  it('部分正确和仅缺字的提交均按原统计计一次', () => {
    let b = start('{{实事求是}}'); b = submit(edit(b, 0, '实事求')); b = submit(b);
    expect(b.session!.currentAttempt!.blanks[0].status).toBe('partial');
    expect(b.bank.stats[b.bank.questions[0].id]).toMatchObject({ wrongAttemptCount: 1, independentCorrectCount: 0 });
    expect(validateBundle(JSON.parse(JSON.stringify(b)))).toEqual(b);
    b = submit(edit(b, 0, '实事求是')); expect(b.session!.currentAttempt!.status).toBe('completed');
    expect(b.bank.stats[b.bank.questions[0].id].independentCorrectCount).toBe(0);
  });
  it('修改输入立即清除该空的旧反馈', () => { let b = start('{{叶绿体}}'); b = submit(edit(b, 0, '叶体')); b = edit(b, 0, '叶绿'); expect(b.session!.currentAttempt!.blanks[0].status).toBe('unjudged'); });
  it('提示补缺字时保留正确后缀与用户来源', () => expect(applyHint(blank('叶体'), '叶绿体')).toEqual({ value: '叶绿体', status: 'unjudged', charSources: ['user','hint','user'] }));
  it('提示仍每次最多补一个 Unicode 字符', () => { const b = applyHint(blank('甲错丁'), '甲乙丙丁'); expect(b.value).toBe('甲乙丁'); expect(b.charSources).toEqual(['user','hint','user']); });
  it('提示跟随用户已选的项目顺序', () => { const b = applyHint(blank('机密、绝蜜、秘密'), '绝密、机密、秘密'); expect(b.value).toBe('机密、绝密、秘密'); expect(b.charSources.filter(s => s === 'hint')).toHaveLength(1); });
  it('已经完整合法的变体和排列不会被提示改写或计求助', () => { let b = start('{{甲、乙}}'); b = edit(b, 0, '乙、甲'); const same = practiceAction(b, { type: 'hint' }); expect(same).toBe(b); });
  it('跨空提示和放弃不重复使用已填正确的选项', () => {
    let b = start('{{甲}}、{{乙}}'); b = submit(edit(b, 0, '乙')); b = practiceAction(b, { type: 'hint' });
    expect(b.session!.currentAttempt!.blanks.map(x => x.value)).toEqual(['乙','甲']);
    b = practiceAction(b, { type: 'give-up' }); expect(b.session!.currentAttempt!.blanks.map(x => x.value)).toEqual(['乙','甲']);
  });
  it('放弃保留多处正确片段，只把替换/补入的字符标为系统来源', () => { let b = start('{{甲乙丙丁}}'); b = edit(b, 0, '甲错丙错'); b = practiceAction(b, { type: 'give-up' }); expect(b.session!.currentAttempt!.blanks[0].charSources).toEqual(['user','give_up','user','give_up']); });
});
