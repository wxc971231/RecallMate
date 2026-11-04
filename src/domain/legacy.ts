// Frozen V1 reader: never use it to construct new banks or recalculate statistics.
import { parseQuestion } from './parser';
import type { Attempt, Bundle, QuestionStats, Session } from './legacyTypes';
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validId(value: unknown): value is string { return typeof value === 'string' && idPattern.test(value); }
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function object(value: unknown): value is Record<string, any> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function date(value: unknown) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function stats(value: unknown): value is QuestionStats {
  return object(value) && ['attemptCount', 'wrongAttemptCount', 'helpAttemptCount', 'independentCorrectCount'].every(k => Number.isSafeInteger(value[k]) && value[k] >= 0)
    && typeof value.inWrongBook === 'boolean' && (value.lastAttemptAt === undefined || date(value.lastAttemptAt))
    && (value.lastDifficultyAt === undefined || date(value.lastDifficultyAt)) && (value.lastDifficultyType === undefined || typeof value.lastDifficultyType === 'string');
}

export function validateLegacyBundle(value: unknown): Bundle {
  assert(object(value) && value.schemaVersion === 1, '不支持此备份版本，请使用 RecallMate V1 格式');
  const bank = value.bank;
  assert(object(bank) && bank.schemaVersion === 1 && validId(bank.id), '题库标识或版本无效');
  assert(typeof bank.name === 'string' && bank.name.trim().length > 0 && bank.name.length <= 120, '题库名称需为 1–120 个字符');
  assert(date(bank.createdAt) && date(bank.updatedAt), '题库时间无效');
  assert(Array.isArray(bank.questions) && bank.questions.length <= 10000, '题目数量无效，最多支持一万题');
  const ids = new Set<string>();
  for (const q of bank.questions) {
    assert(object(q) && validId(q.id) && !ids.has(q.id), '题目 ID 无效或重复');
    assert(typeof q.sourceText === 'string' && q.sourceText.length <= 100000 && date(q.createdAt) && date(q.updatedAt), '题目内容或时间无效');
    parseQuestion(q.sourceText); ids.add(q.id);
  }
  assert(object(bank.stats), '缺少题目统计');
  for (const [id, entry] of Object.entries(bank.stats)) assert(ids.has(id) && stats(entry), '统计内容无效或引用了不存在的题目');
  for (const id of ids) assert(stats(bank.stats[id]), '部分题目缺少统计');
  if (value.session !== undefined) {
    const s = value.session as Session;
    assert(object(s) && s.schemaVersion === 1 && s.bankId === bank.id && validId(s.sessionId), '练习进度标识无效');
    assert(['all', 'random', 'wrong', 'single', 'round-wrong'].includes(s.mode), '练习模式无效');
    assert(Array.isArray(s.questionIds) && s.questionIds.length > 0 && s.questionIds.every(id => ids.has(id)) && new Set(s.questionIds).size === s.questionIds.length, '练习队列包含无效或重复的题目');
    assert(Number.isInteger(s.currentIndex) && s.currentIndex >= 0 && s.currentIndex <= s.questionIds.length && typeof s.isFinished === 'boolean', '练习位置无效');
    assert(s.isFinished === (s.currentIndex === s.questionIds.length) && date(s.startedAt) && date(s.updatedAt), '练习状态或时间无效');
    assert(Array.isArray(s.summaries) && s.summaries.length === s.currentIndex, '本轮统计与练习进度不一致');
    const attemptIds = new Set<string>();
    s.summaries.forEach((summary, i) => {
      assert(object(summary) && validId(summary.attemptId) && !attemptIds.has(summary.attemptId) && summary.questionId === s.questionIds[i], '本轮统计引用无效');
      assert(['independent', 'wrong', 'help', 'skipped'].every(k => typeof (summary as any)[k] === 'boolean'), '本轮统计字段无效');
      attemptIds.add(summary.attemptId);
    });
    if (!s.isFinished) {
      const a = s.currentAttempt as Attempt;
      assert(object(a) && validId(a.id) && !attemptIds.has(a.id) && a.questionId === s.questionIds[s.currentIndex] && ['active', 'completed', 'abandoned'].includes(a.status), '当前作答无效');
      assert(stats(a.beforeStats) && date(a.startedAt) && (a.endedAt === undefined || date(a.endedAt)) && (a.difficultyAt === undefined || date(a.difficultyAt)), '作答统计或时间无效');
      assert(a.difficultyType === undefined || typeof a.difficultyType === 'string', '困难类型无效');
      assert(a.wrongBookDismissed === undefined || typeof a.wrongBookDismissed === 'boolean', '错题移出标记无效');
      assert(a.strictBlankOrder === undefined || typeof a.strictBlankOrder === 'boolean', '填空顺序规则无效');
      assert(['hadWrongSubmission', 'usedHint', 'viewedAnswer', 'gaveUp'].every(k => typeof (a as any)[k] === 'boolean'), '作答标记无效');
      const parsed = parseQuestion(bank.questions.find((q: any) => q.id === a.questionId).sourceText);
      assert(Array.isArray(a.blanks) && a.blanks.length === parsed.answers.length && Number.isInteger(a.activeBlankIndex) && a.activeBlankIndex >= 0 && a.activeBlankIndex < a.blanks.length, '填空位置无效');
      for (const b of a.blanks) assert(object(b) && typeof b.value === 'string' && b.value.length <= 100000 && ['unjudged', 'correct', 'partial', 'incorrect'].includes(b.status) && Array.isArray(b.charSources) && b.charSources.length === Array.from(b.value).length && b.charSources.every(s => ['user', 'hint', 'give_up'].includes(s)), '填空内容或字符来源无效');
      assert(a.status !== 'completed' || a.blanks.every(b => b.status === 'correct'), '完成状态与填空状态不一致');
    } else assert(s.currentAttempt === undefined, '已结束的练习不应有当前作答');
  }
  return value as Bundle;
}
