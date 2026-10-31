import { parseQuestion } from './parser';
import { assessBlanks, compareAnswer, judgmentStatus, type AnswerComparison } from './answerMatcher';
import type { Attempt, AttemptSummary, Bank, BlankState, Bundle, CharSource, ParsedQuestion, PracticeMode, QuestionStats, Session } from './types';

export const emptyStats = (): QuestionStats => ({ attemptCount: 0, wrongAttemptCount: 0, helpAttemptCount: 0, independentCorrectCount: 0, inWrongBook: false });
const now = () => new Date().toISOString();
export const hasHelp = (a: Attempt) => a.usedHint || a.viewedAnswer || a.gaveUp;

export function reconcileSources(previous: BlankState, value: string, source: CharSource = 'user'): CharSource[] {
  const before = Array.from(previous.value), after = Array.from(value);
  let prefix = 0, suffix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  return after.map((_, index) => index < prefix ? previous.charSources[index] ?? 'user' : index >= after.length - suffix ? previous.charSources[before.length - (after.length - index)] ?? 'user' : source);
}

function fillCompared(blank: BlankState, comparison: AnswerComparison, source: 'hint' | 'give_up'): BlankState {
  const value: string[] = [], charSources: CharSource[] = [];
  let added = false;
  for (const step of comparison.steps) {
    if (step.kind === 'equal') { value.push(step.inputChar!); charSources.push(blank.charSources[step.inputIndex] ?? 'user'); }
    else if (step.targetChar !== undefined && (source === 'give_up' || !added)) { value.push(step.targetChar); charSources.push(source); added = true; }
  }
  return { value: value.join(''), status: 'unjudged', charSources };
}

export function applyHint(blank: BlankState, standard: string): BlankState {
  const comparison = compareAnswer(blank.value, [standard]);
  return comparison.correct ? blank : fillCompared(blank, comparison, 'hint');
}

function refreshJudgments(attempt: Attempt, question: ParsedQuestion) {
  const comparisons = assessBlanks(attempt.blanks, question);
  attempt.blanks.forEach((blank, index) => { if (blank.status !== 'unjudged') blank.status = judgmentStatus(comparisons[index]); });
}

export function createAttempt(bank: Bank, questionId: string): Attempt {
  const question = bank.questions.find(q => q.id === questionId);
  if (!question) throw new Error('题目不存在');
  return {
    id: crypto.randomUUID(), questionId, status: 'active',
    blanks: parseQuestion(question.sourceText).answers.map(() => ({ value: '', status: 'unjudged', charSources: [] })),
    activeBlankIndex: 0, hadWrongSubmission: false, usedHint: false, viewedAnswer: false, gaveUp: false,
    startedAt: now(), beforeStats: { ...bank.stats[questionId] ?? emptyStats() },
  };
}

export function summarize(a: Attempt): AttemptSummary {
  return { attemptId: a.id, questionId: a.questionId, wrong: a.hadWrongSubmission, help: hasHelp(a), skipped: a.status === 'skipped', independent: a.status === 'completed' && !a.hadWrongSubmission && !hasHelp(a) && a.blanks.every(b => b.status === 'correct' && b.charSources.every(s => s === 'user')) };
}

export function projectStats(a: Attempt): QuestionStats {
  const summary = summarize(a), base = a.beforeStats;
  return {
    ...base, attemptCount: base.attemptCount + 1,
    wrongAttemptCount: base.wrongAttemptCount + Number(summary.wrong),
    helpAttemptCount: base.helpAttemptCount + Number(summary.help),
    independentCorrectCount: base.independentCorrectCount + Number(summary.independent),
    inWrongBook: base.inWrongBook || (!a.wrongBookDismissed && (summary.wrong || summary.help)),
    lastAttemptAt: a.endedAt ?? a.startedAt,
    lastDifficultyAt: a.difficultyAt ?? base.lastDifficultyAt,
    lastDifficultyType: a.difficultyType ?? base.lastDifficultyType,
  };
}

export function updateAttempt(bundle: Bundle, a: Attempt): Bundle {
  if (!bundle.session) return bundle;
  const timestamp = now();
  return { ...bundle, bank: { ...bundle.bank, updatedAt: timestamp, stats: { ...bundle.bank.stats, [a.questionId]: projectStats(a) } }, session: { ...bundle.session, currentAttempt: a, updatedAt: timestamp } };
}

export function startSession(bundle: Bundle, mode: PracticeMode, ids?: string[]): Bundle {
  let questionIds = ids ?? bundle.bank.questions.filter(q => mode !== 'wrong' || bundle.bank.stats[q.id]?.inWrongBook).map(q => q.id);
  questionIds = [...new Set(questionIds)].filter(id => bundle.bank.questions.some(q => q.id === id));
  if (mode === 'random') for (let i = questionIds.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [questionIds[i], questionIds[j]] = [questionIds[j], questionIds[i]]; }
  if (!questionIds.length) throw new Error('没有可练习的题目');
  const session: Session = { schemaVersion: 1, bankId: bundle.bank.id, sessionId: crypto.randomUUID(), mode, questionIds, currentIndex: 0, summaries: [], startedAt: now(), updatedAt: now(), isFinished: false };
  return updateAttempt({ ...bundle, session }, createAttempt(bundle.bank, questionIds[0]));
}

export type PracticeAction = { type: 'edit'; index: number; value: string } | { type: 'focus'; index: number } | { type: 'submit' | 'hint' | 'view' | 'give-up' | 'next' };
export function practiceAction(bundle: Bundle, action: PracticeAction): Bundle {
  const session = bundle.session, current = session?.currentAttempt;
  if (!session || !current || session.isFinished) return bundle;
  const question = bundle.bank.questions.find(q => q.id === current.questionId);
  if (!question) return bundle;
  const parsed = parseQuestion(question.sourceText);
  const a: Attempt = { ...current, blanks: current.blanks.map(b => ({ ...b, charSources: [...b.charSources] })) };
  if (action.type === 'next') {
    if (a.status === 'active') { a.status = 'skipped'; a.endedAt = now(); }
    const updated = updateAttempt(bundle, a);
    const summaries = [...session.summaries.filter(s => s.attemptId !== a.id), summarize(a)];
    const currentIndex = session.currentIndex + 1;
    const nextSession = { ...updated.session!, currentIndex, summaries, isFinished: currentIndex >= session.questionIds.length, currentAttempt: undefined };
    const next = { ...updated, session: nextSession };
    return nextSession.isFinished ? next : updateAttempt(next, createAttempt(next.bank, session.questionIds[currentIndex]));
  }
  if (a.status === 'abandoned' || a.status === 'skipped') return bundle;
  const difficulty = (type: string) => { a.difficultyAt = now(); a.difficultyType = type; };
  if (action.type === 'focus') {
    a.activeBlankIndex = Math.max(0, Math.min(action.index, a.blanks.length - 1));
    return { ...bundle, session: { ...session, currentAttempt: a } };
  }
  if (action.type === 'edit') {
    const blank = a.blanks[action.index];
    if (!blank || blank.value === action.value) return bundle;
    a.blanks[action.index] = { value: action.value, status: 'unjudged', charSources: reconcileSources(blank, action.value) };
    a.activeBlankIndex = action.index; a.status = 'active'; a.endedAt = undefined;
    refreshJudgments(a, parsed);
  }
  if (action.type === 'submit') {
    if (a.status === 'completed') return practiceAction(bundle, { type: 'next' });
    const blank = a.blanks[a.activeBlankIndex];
    if (blank.status === 'unjudged') blank.status = 'incorrect';
    refreshJudgments(a, parsed);
    if (blank.status !== 'correct') { a.hadWrongSubmission = true; difficulty('答错'); }
    const first = a.blanks.findIndex(b => b.status !== 'correct');
    if (first < 0) { a.status = 'completed'; a.endedAt = now(); }
    else a.activeBlankIndex = first;
  }
  if (action.type === 'hint') {
    if (a.status !== 'active') return bundle;
    const comparisons = assessBlanks(a.blanks, parsed);
    // Complete valid variants and permutations need Enter, not another hint.
    const index = a.blanks.findIndex((b, i) => b.status !== 'correct' && !comparisons[i].correct);
    if (index < 0) return bundle;
    a.blanks[index] = fillCompared(a.blanks[index], comparisons[index], 'hint');
    a.activeBlankIndex = index; a.usedHint = true; difficulty('提示');
    refreshJudgments(a, parsed);
  }
  if (action.type === 'view') { a.viewedAnswer = true; difficulty('查看答案'); }
  if (action.type === 'give-up') {
    if (a.status !== 'active') return bundle;
    const comparisons = assessBlanks(a.blanks, parsed);
    a.blanks = a.blanks.map((b, i) => b.status === 'correct' || comparisons[i].correct ? b : fillCompared(b, comparisons[i], 'give_up'));
    a.status = 'abandoned'; a.gaveUp = true; a.endedAt = now(); difficulty('放弃');
  }
  return updateAttempt(bundle, a);
}

export function sortWrongQuestions(bank: Bank, recent = false) {
  return bank.questions.filter(q => bank.stats[q.id]?.inWrongBook).sort((a, b) => {
    const x = bank.stats[a.id], y = bank.stats[b.id];
    return (!recent && (y.wrongAttemptCount - x.wrongAttemptCount || y.helpAttemptCount - x.helpAttemptCount)) || (y.lastDifficultyAt ?? '').localeCompare(x.lastDifficultyAt ?? '');
  });
}
