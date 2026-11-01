export const shortcutActions = ['answer', 'hint', 'giveUp', 'skip', 'submit'] as const;
export type ShortcutAction = typeof shortcutActions[number];
export type Shortcuts = Record<ShortcutAction, string | null>;
export const shortcutNames: Record<ShortcutAction, string> = { answer: '查看答案（按住）', hint: '提示', giveUp: '放弃', skip: '跳过', submit: '确认／下一题' };
export const defaultShortcuts: Shortcuts = { answer: 'F1', hint: 'F2', giveUp: 'Shift+F3', skip: 'F4', submit: 'Enter' };
const reserved = new Set(['F5','Ctrl+F5','Shift+F5','F10','Shift+F10','F11','F12','Ctrl+R','Ctrl+Shift+R','Ctrl+W','Ctrl+Shift+W','Alt+F4','Ctrl+A','Ctrl+C','Ctrl+V','Ctrl+X','Ctrl+Z','Ctrl+Y','Ctrl+Shift+Z','Ctrl+Shift+V','Ctrl+Shift+I','Ctrl+Shift+J','Ctrl+Shift+C']);

export function normalizeShortcut(value: string): string {
  const parts = value.split('+').map(part => part.trim());
  const rawKey = parts.pop() ?? '';
  const modifiers = parts.map(part => part.toLowerCase());
  if (new Set(modifiers).size !== modifiers.length || modifiers.some(part => !['ctrl','alt','shift'].includes(part))) throw new Error('只支持 Ctrl、Alt、Shift 组合键');
  const key = rawKey.toLowerCase() === 'enter' ? 'Enter' : rawKey.toUpperCase();
  if (!/^(?:F(?:[1-9]|1[0-2])|Enter|[A-Z0-9])$/.test(key)) throw new Error('请使用 F1–F9、Enter，或 Ctrl/Alt 加字母或数字');
  if (/^[A-Z0-9]$/.test(key) && !modifiers.includes('ctrl') && !modifiers.includes('alt')) throw new Error('字母和数字需搭配 Ctrl 或 Alt，避免影响答题输入');
  const result = [...(['ctrl','alt','shift'] as const).filter(modifier => modifiers.includes(modifier)).map(modifier => ({ ctrl:'Ctrl', alt:'Alt', shift:'Shift' })[modifier]), key].join('+');
  if (reserved.has(result)) throw new Error(`${result} 是系统或编辑快捷键，请换一个`);
  return result;
}

export function validateShortcuts(input: unknown): Shortcuts {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('快捷键设置格式无效');
  const result = {} as Shortcuts;
  const used = new Map<string, ShortcutAction>();
  for (const action of shortcutActions) {
    const value = (input as Record<string, unknown>)[action];
    if (value !== null && typeof value !== 'string') throw new Error(`缺少“${shortcutNames[action]}”的快捷键设置`);
    const key = value === null ? null : normalizeShortcut(value);
    if (key && used.has(key)) throw new Error(`${key} 同时用于“${shortcutNames[used.get(key)!]}”和“${shortcutNames[action]}”，请避免重复`);
    if (key) used.set(key, action);
    result[action] = key;
  }
  return result;
}

export function shortcutFromEvent(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): string | null {
  if (event.metaKey || ['Control','Alt','Shift','Meta','AltGraph'].includes(event.key)) return null;
  try { return normalizeShortcut([...(event.ctrlKey ? ['Ctrl'] : []), ...(event.altKey ? ['Alt'] : []), ...(event.shiftKey ? ['Shift'] : []), event.key].join('+')); }
  catch { return null; }
}

export function shortcutAria(value: string | null): string | undefined { return value?.replace('Ctrl+', 'Control+'); }
