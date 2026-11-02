import type { BlankState, ParsedQuestion } from './types';

export type CharJudgment = 'correct' | 'incorrect' | 'neutral';
export interface DiffStep { kind: 'equal' | 'replace' | 'insert' | 'delete'; inputIndex: number; inputChar?: string; targetChar?: string }
export interface AnswerComparison {
  correct: boolean; target: string; chars: CharJudgment[]; missing: number;
  distance: number; steps: DiffStep[]; duplicate: boolean;
}
export interface BlankComparison extends AnswerComparison { targetIndex: number }
const characters = (text: string) => Array.from(text);

// Align Unicode code points, so a missing character does not turn the suffix red.
// Strip shared ends before allocating a bounded edit-distance matrix.
export function compareText(input: string, target: string): AnswerComparison {
  const raw = characters(input), left = input.trim(), right = target.trim();
  const a = characters(left), b = characters(right);
  const offset = characters(input.slice(0, input.length - input.trimStart().length)).length;
  const chars: CharJudgment[] = raw.map(() => 'neutral');
  const steps: DiffStep[] = [];
  let prefix = 0, suffix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  const emit = (kind: DiffStep['kind'], i: number, j: number) => {
    const step: DiffStep = { kind, inputIndex: offset + i };
    if (kind !== 'insert') { step.inputChar = a[i]; chars[offset + i] = kind === 'equal' ? 'correct' : 'incorrect'; }
    if (kind !== 'delete') step.targetChar = b[j];
    steps.push(step);
  };
  for (let i = 0; i < prefix; i++) emit('equal', i, i);
  const n = a.length - prefix - suffix, m = b.length - prefix - suffix;
  if ((n + 1) * (m + 1) <= 300000) {
    const width = m + 1, costs = new Uint32Array((n + 1) * width);
    for (let i = n; i >= 0; i--) for (let j = m; j >= 0; j--) {
      costs[i * width + j] = i === n ? m - j : j === m ? n - i
        : a[prefix + i] === b[prefix + j] ? costs[(i + 1) * width + j + 1]
          : 1 + Math.min(costs[(i + 1) * width + j + 1], costs[(i + 1) * width + j], costs[i * width + j + 1]);
    }
    let i = 0, j = 0;
    while (i < n || j < m) {
      const at = costs[i * width + j];
      if (i < n && j < m && a[prefix + i] === b[prefix + j]) { emit('equal', prefix + i++, prefix + j++); }
      else if (i < n && j < m && at === 1 + costs[(i + 1) * width + j + 1]) { emit('replace', prefix + i++, prefix + j++); }
      else if (i < n && at === 1 + costs[(i + 1) * width + j]) { emit('delete', prefix + i++, prefix + j); }
      else { emit('insert', prefix + i, prefix + j++); }
    }
  } else {
    // Resource bound for unusually large pasted answers. Exact acceptance is still
    // strict; avoid freezing the app just to render approximate character feedback.
    for (let i = 0; i < Math.max(n, m); i++) emit(i >= n ? 'insert' : i >= m ? 'delete' : a[prefix + i] === b[prefix + i] ? 'equal' : 'replace', prefix + Math.min(i, n), prefix + Math.min(i, m));
  }
  for (let i = 0; i < suffix; i++) emit('equal', a.length - suffix + i, b.length - suffix + i);
  return { correct: left === right, target: right, chars, steps, distance: steps.filter(s => s.kind !== 'equal').length, missing: steps.filter(s => s.kind === 'insert').length, duplicate: false };
}

// Lexical uses of 和 are not conjunctions. Explicit whitespace around 和 always
// denotes a connector, which also gives authors a way to disambiguate phrases.
const literalAndWords = ['中华人民共和国', '共和国', '共和', '和平', '和谐', '和睦', '和尚', '和田', '和解', '和气', '和蔼', '和煦', '和风', '和弦', '和声', '和面', '温和', '柔和', '调和', '中和', '饱和', '总和', '附和', '应和', '亲和', '求和', '不和', '祥和'];
function splitEnumeration(text: string): { items: string[]; separators: string[] } {
  const items: string[] = [], separators: string[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character !== '、' && character !== '和') continue;
    if (character === '和' && !(/\s/.test(text[index - 1] ?? '') && /\s/.test(text[index + 1] ?? ''))) {
      if (literalAndWords.some(word => { const at = index - word.indexOf('和'); return at >= 0 && text.slice(at, at + word.length) === word; })) continue;
    }
    items.push(text.slice(start, index)); separators.push(character); start = index + 1;
  }
  items.push(text.slice(start));
  return { items, separators };
}
function enumeration(text: string): string[] | null {
  const split = splitEnumeration(text);
  const parts = split.items.map(item => item.trim());
  return split.separators.length && parts.every(Boolean) ? parts : null;
}
function key(text: string): string {
  const items = enumeration(text);
  return items ? `list:${JSON.stringify(items.sort())}` : `text:${text.trim()}`;
}
export function matchesAnswer(input: string, accepted: string[], strictBlankOrder = false): boolean {
  if (strictBlankOrder) return accepted.some(target => input.trim() === target.trim());
  const value = key(input);
  return accepted.some(target => key(target) === value);
}

// Minimum-cost one-to-one assignment. Exact submitted answers have priority over
// drafts; then maximize complete draft matches; only then optimize partial text.
function minimumAssignment(costs: number[][]): number[] {
  const n = costs.length, u = Array(n + 1).fill(0), v = Array(n + 1).fill(0), p = Array(n + 1).fill(0), way = Array(n + 1).fill(0);
  for (let row = 1; row <= n; row++) {
    p[0] = row;
    let column = 0;
    const best = Array(n + 1).fill(Infinity), seen = Array(n + 1).fill(false);
    do {
      seen[column] = true;
      const currentRow = p[column];
      let delta = Infinity, next = 0;
      for (let col = 1; col <= n; col++) if (!seen[col]) {
        const reduced = costs[currentRow - 1][col - 1] - u[currentRow] - v[col];
        if (reduced < best[col]) { best[col] = reduced; way[col] = column; }
        if (best[col] < delta) { delta = best[col]; next = col; }
      }
      for (let col = 0; col <= n; col++) if (seen[col]) { u[p[col]] += delta; v[col] -= delta; } else best[col] -= delta;
      column = next;
    } while (p[column] !== 0);
    do { const previous = way[column]; p[column] = p[previous]; column = previous; } while (column !== 0);
  }
  const assignment = Array(n).fill(-1);
  for (let col = 1; col <= n; col++) assignment[p[col] - 1] = col - 1;
  return assignment;
}

function assign(inputs: { value: string; judged: boolean; confirmed?: boolean }[], targets: string[][], compare: (value: string, targets: string[]) => AnswerComparison) {
  const n = inputs.length;
  const textSize = inputs.reduce((sum, input) => sum + input.value.length, 0) + targets.reduce((sum, alternatives) => sum + alternatives.reduce((total, value) => total + value.length, 0), 0);
  if (n <= 48 && textSize * n <= 250000) {
    const pairs = inputs.map(input => targets.map(target => compare(input.value, target)));
    const distanceBudget = 1001 * (n + 1) * (n + 1), draftPenalty = distanceBudget + 1, judgedPenalty = draftPenalty * (n + 1), confirmedPenalty = judgedPenalty * (n + 1);
    const costs = pairs.map((row, i) => row.map((pair, j) => (pair.correct ? 0 : inputs[i].confirmed ? confirmedPenalty : inputs[i].judged ? judgedPenalty : draftPenalty)
      + Math.round(1000 * pair.distance / Math.max(1, characters(inputs[i].value).length, characters(pair.target).length)) * (n + 1) + Number(i !== j)));
    const assignment = minimumAssignment(costs);
    return assignment.map((targetIndex, i) => ({ ...pairs[i][targetIndex], targetIndex }));
  }
  // Large groups use sparse maximum matching, rather than an unbounded dense
  // matrix. This still handles overlapping aliases without greedy false failures.
  const lookup = new Map<string, number[]>();
  targets.forEach((alternatives, j) => alternatives.forEach(target => { const k = key(target); const slots = lookup.get(k); if (slots) slots.push(j); else lookup.set(k, [j]); }));
  const owners = Array(n).fill(-1), assignment = Array(n).fill(-1);
  const inputKeys = inputs.map(input => key(input.value)), freeCursor = new Map<string, number>();
  const visit = (start: number) => {
    const pending = [start], seenKeys = new Set<string>(), parents = new Map<number, number>();
    for (let at = 0; at < pending.length; at++) {
      const row = pending[at], k = inputKeys[row];
      if (seenKeys.has(k)) continue;
      seenKeys.add(k);
      const edges = lookup.get(k) ?? [];
      let cursor = freeCursor.get(k) ?? 0;
      while (cursor < edges.length && owners[edges[cursor]] >= 0) cursor++;
      freeCursor.set(k, cursor);
      if (cursor < edges.length) {
        let col = edges[cursor]; parents.set(col, row);
        while (col >= 0) { const owner = parents.get(col)!; const previous = assignment[owner]; owners[col] = owner; assignment[owner] = col; col = previous; }
        return;
      }
      for (const col of edges) if (!parents.has(col)) { parents.set(col, row); pending.push(owners[col]); }
    }
  };
  [...inputs.keys()].sort((a, b) => (Number(inputs[b].confirmed) * 2 + Number(inputs[b].judged)) - (Number(inputs[a].confirmed) * 2 + Number(inputs[a].judged))).forEach(visit);
  const free = new Set(targets.map((_, i) => i).filter(i => owners[i] < 0));
  assignment.forEach((col, row) => { if (col < 0) { const next = free.has(row) ? row : free.values().next().value!; assignment[row] = next; free.delete(next); } });
  return assignment.map((targetIndex, i) => ({ ...compare(inputs[i].value, targets[targetIndex]), targetIndex }));
}

function compareCandidate(input: string, target: string): AnswerComparison {
  const expected = enumeration(target);
  if (!expected) return compareText(input, target);
  if (matchesAnswer(input, [target])) {
    const result = compareText(input, input.trim());
    return { ...result, correct: true };
  }
  const split = splitEnumeration(input), targetSplit = splitEnumeration(target);
  const rawItems = split.items, size = Math.max(rawItems.length, expected.length);
  const rows = Array.from({ length: size }, (_, i) => ({ value: rawItems[i] ?? '', judged: false }));
  const targets = Array.from({ length: size }, (_, i) => [expected[i] ?? '']);
  const pairs = assign(rows, targets, (value, alternatives) => compareText(value, alternatives[0]));
  const orderedItems = pairs.flatMap((pair, i) => {
    if (pair.targetIndex >= expected.length) return [];
    const raw = rawItems[i] ?? '';
    const leading = raw.trim() ? raw.match(/^\s*/)![0] : '', trailing = raw.trim() ? raw.match(/\s*$/)![0] : '';
    return [leading + expected[pair.targetIndex] + trailing];
  });
  const ordered = orderedItems.map((item, i) => i === 0 ? item : (split.separators[i - 1] ?? targetSplit.separators[i - 1] ?? '、') + item).join('');
  const comparison = compareText(input, ordered);
  const chars: CharJudgment[] = characters(input).map(() => 'neutral');
  let offset = 0;
  for (let i = 0; i < rawItems.length; i++) {
    pairs[i].chars.forEach((status, j) => { chars[offset + j] = status; });
    offset += characters(rawItems[i]).length + 1;
  }
  return { ...comparison, correct: false, chars,
    missing: pairs.reduce((sum, pair) => sum + pair.missing, 0),
    duplicate: rawItems.some((item, i) => !!item.trim() && !pairs[i].correct && expected.includes(item.trim())),
  };
}

export function compareAnswer(input: string, accepted: string[], strictBlankOrder = false): AnswerComparison {
  let best: AnswerComparison | undefined;
  for (const target of accepted) {
    const result = strictBlankOrder ? compareText(input, target) : compareCandidate(input, target);
    if (result.correct) return result;
    if (!best || result.distance < best.distance) best = result;
  }
  return best ?? compareText(input, '');
}

export function answerGroups(question: ParsedQuestion): number[][] {
  const groups: number[][] = [];
  for (let index = 0; index < question.answers.length; index++) {
    if (index > 0 && /^\s*(?:、|和)\s*$/.test(question.fragments[index])) groups[groups.length - 1].push(index);
    else groups.push([index]);
  }
  return groups;
}

export function assessBlanks(blanks: BlankState[], question: ParsedQuestion, strictBlankOrder = false): BlankComparison[] {
  if (strictBlankOrder) return blanks.map((blank, index) => ({ ...compareAnswer(blank.value, question.answers[index], true), targetIndex: index }));
  const results: BlankComparison[] = [];
  for (const group of answerGroups(question)) {
    const pairs = assign(group.map(i => ({ value: blanks[i].value, judged: blanks[i].status !== 'unjudged', confirmed: blanks[i].status === 'correct' })), group.map(i => question.answers[i]), compareAnswer);
    pairs.forEach((pair, row) => {
      const value = blanks[group[row]].value;
      results[group[row]] = { ...pair, targetIndex: group[pair.targetIndex],
        duplicate: pair.duplicate || (!!value.trim() && !pair.correct && group.some(i => matchesAnswer(value, question.answers[i]))),
      };
    });
  }
  return results;
}

export function judgmentStatus(comparison: AnswerComparison): BlankState['status'] {
  return comparison.correct ? 'correct' : comparison.chars.includes('correct') ? 'partial' : 'incorrect';
}

export function feedbackLabel(comparison: AnswerComparison): string {
  if (comparison.correct) return '✓ 正确';
  if (comparison.duplicate) return '含重复项';
  if (!comparison.chars.some(status => status !== 'neutral')) return '尚未填写';
  if (comparison.missing > 0 && !comparison.chars.includes('incorrect')) return '尚未完整';
  return comparison.chars.includes('correct') ? '部分正确' : '请修改标红部分';
}
