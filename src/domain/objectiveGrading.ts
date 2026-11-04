import type { ObjectiveQuestion } from './types';
export type ObjectiveAnswer = boolean | string | string[] | null;
export interface ObjectiveResult { correct: boolean; empty: boolean; missingOptionIds: string[]; extraOptionIds: string[]; selectedCorrectIds: string[] }
export function gradeObjective(question: ObjectiveQuestion, selected: ObjectiveAnswer): ObjectiveResult {
  const empty = selected === null || (Array.isArray(selected) && selected.length === 0);
  if (question.type === 'true_false') return { correct: typeof selected === 'boolean' && selected === question.answer, empty, missingOptionIds: [], extraOptionIds: [], selectedCorrectIds: [] };
  const expected = question.type === 'single_choice' ? [question.answer] : question.answer;
  const actual = typeof selected === 'string' ? [selected] : Array.isArray(selected) ? selected : [];
  const missingOptionIds = expected.filter(id => !actual.includes(id)), extraOptionIds = actual.filter(id => !expected.includes(id));
  const valid = question.type === 'single_choice' ? typeof selected === 'string' : Array.isArray(selected);
  return { correct: valid && !empty && new Set(actual).size === actual.length && !missingOptionIds.length && !extraOptionIds.length, empty, missingOptionIds, extraOptionIds, selectedCorrectIds: actual.filter(id => expected.includes(id)) };
}
