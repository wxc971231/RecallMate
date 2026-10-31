import type { ImportPreview, ParsedQuestion } from './types';
import { matchesAnswer } from './answerMatcher';

export function parseQuestionFile(input: string): ImportPreview {
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const result: ImportPreview = { name: '', questions: [], blankCount: 0, errors: [] };
  const first = lines.findIndex(line => line.trim() !== '');
  if (first >= 0 && /^#\s+/.test(lines[first])) {
    result.name = lines[first].replace(/^#\s+/, '').trim();
    lines[first] = '';
  }
  let block: string[] = [], startLine = 1, question = 0;
  const consume = () => {
    const raw = block.join('\n');
    if (!raw.trim()) return;
    question++;
    const sourceText = raw.trim();
    const offset = raw.indexOf(sourceText);
    const fragments: string[] = [], answers: string[][] = [];
    const issue = (at: number, message: string) => result.errors.push({ question, line: startLine + raw.slice(0, offset + at).split('\n').length - 1, message });
    let cursor = 0, partStart = 0;
    const initialErrors = result.errors.length;
    while (cursor < sourceText.length) {
      if (sourceText.startsWith('}}', cursor)) { issue(cursor, '多余的右花括号 }}'); cursor += 2; continue; }
      if (!sourceText.startsWith('{{', cursor)) { cursor++; continue; }
      const end = sourceText.indexOf('}}', cursor + 2);
      if (end < 0) { issue(cursor, '填空缺少右花括号 }}'); break; }
      const content = sourceText.slice(cursor + 2, end);
      if (/[{}]/.test(content)) issue(cursor, '填空内部不能嵌套花括号');
      const accepted = content.split('|').map(answer => answer.trim());
      if (accepted.some(answer => !answer)) issue(cursor, '答案不能为空，多答案之间也不能留空项');
      fragments.push(sourceText.slice(partStart, cursor));
      answers.push(accepted);
      cursor = end + 2; partStart = cursor;
    }
    fragments.push(sourceText.slice(partStart));
    if (!answers.length && result.errors.length === initialErrors) issue(0, '题目至少需要一个 {{答案}} 填空');
    if (result.errors.length === initialErrors && answers.length) {
      result.questions.push({ sourceText, fragments, answers });
      result.blankCount += answers.length;
    }
  };
  lines.forEach((line, index) => {
    if (/^\s*---\s*$/.test(line)) { consume(); block = []; startLine = index + 2; }
    else block.push(line);
  });
  consume();
  if (!question) result.errors.push({ question: 0, line: 1, message: '还没有题目，请输入包含 {{答案}} 的题目' });
  return result;
}

export function parseQuestion(sourceText: string): ParsedQuestion {
  const result = parseQuestionFile(sourceText);
  if (result.errors.length || result.questions.length !== 1) throw new Error('题目格式错误，请检查填空标记');
  return result.questions[0];
}

export function checkAnswer(input: string, accepted: string[]): boolean {
  return matchesAnswer(input, accepted);
}
