import { useEffect, useState } from 'react';
import { defaultShortcuts, normalizeShortcut, shortcutActions, shortcutFromEvent, shortcutNames, validateShortcuts, type ShortcutAction, type Shortcuts } from '../domain/shortcuts';

export function ShortcutSettings({ value, ready, status, error, save }: { value: Shortcuts; ready: boolean; status: string; error: string; save(shortcuts: Shortcuts): void }) {
  const [draft, setDraft] = useState<Shortcuts>({ ...value });
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [recordError, setRecordError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => { setDraft({ ...value }); }, [value]);
  let validationError = '';
  try { validateShortcuts(draft); } catch (reason) { validationError = (reason as Error).message; }
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);
  return <section className="shortcut-settings"><h3>答题快捷键</h3><p>点击快捷键框后按下新组合。只在答题页面生效，输入法选词、弹窗和字号调整期间暂停。查看答案需按住，松开还原。</p>
    <div className="shortcut-list">{shortcutActions.map(action => <div className="shortcut-row" key={action}>
      <label htmlFor={`shortcut-${action}`}>{shortcutNames[action]}</label>
      <input id={`shortcut-${action}`} aria-label={`${shortcutNames[action]}快捷键`} className="text-input shortcut-recorder" readOnly disabled={!ready} value={recording === action ? '请按快捷键…' : draft[action] ?? '未设置'}
        onFocus={() => { setRecording(action); setRecordError(''); setSubmitted(false); }} onBlur={() => setRecording(null)}
        onKeyDown={event => {
          if (event.key === 'Tab') { setRecording(null); return; }
          event.preventDefault(); event.stopPropagation();
          if (event.repeat || event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === 'Escape') { setRecording(null); setRecordError(''); event.currentTarget.blur(); return; }
          if (['Control','Alt','Shift','Meta','AltGraph'].includes(event.key)) return;
          if (['Backspace','Delete'].includes(event.key) && !event.ctrlKey && !event.altKey && !event.shiftKey) { setDraft({ ...draft, [action]: null }); setRecording(null); setRecordError(''); return; }
          const shortcut = shortcutFromEvent(event.nativeEvent);
          if (!shortcut) {
            try { normalizeShortcut([event.ctrlKey && 'Ctrl',event.altKey && 'Alt',event.shiftKey && 'Shift',event.metaKey && 'Meta',event.key].filter(Boolean).join('+')); }
            catch (reason) { setRecordError((reason as Error).message); }
            return;
          }
          setDraft({ ...draft, [action]: shortcut }); setRecording(null); setRecordError('');
        }} />
      <button className="text-button" disabled={!ready || draft[action] === null} aria-label={`停用${shortcutNames[action]}快捷键`} onClick={() => { setDraft({ ...draft, [action]: null }); setRecordError(''); setSubmitted(false); }}>停用</button>
    </div>)}</div>
    {(recordError || validationError || error) && <p className="inline-error" role="alert">{recordError || validationError || error}</p>}
    <div className="shortcut-settings-actions"><button className="text-button" disabled={!ready} onClick={() => { setDraft({ ...defaultShortcuts }); setRecording(null); setRecordError(''); setSubmitted(false); }}>恢复默认快捷键</button>
      <button className="secondary" disabled={!ready || !dirty || !!validationError || !!recordError || status === 'pending'} onClick={() => { save(validateShortcuts(draft)); setSubmitted(true); }}>保存快捷键</button></div>
    {submitted && !dirty && <p role="status" className="shortcut-save-status">{status === 'pending' ? '正在保存快捷键…' : status === 'error' ? '保存失败，请点击右下角重试。' : '快捷键已保存'}</p>}
  </section>;
}
