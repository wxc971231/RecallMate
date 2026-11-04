import { useEffect, useRef } from 'react';
import { shortcutActions, shortcutFromEvent, type ShortcutAction, type Shortcuts } from '../domain/shortcuts';
import { isDesktop } from '../services/platform';

interface Controls { enabled: boolean; allowed?: ShortcutAction[]; composing(): boolean; action(action: ShortcutAction): void; release(restore: boolean): void }
export function usePracticeShortcuts(shortcuts: Shortcuts, controls: Controls) {
  const current = useRef({ shortcuts, controls }); current.current = { shortcuts, controls };
  useEffect(() => {
    if (!isDesktop) return;
    let held: { code: string; key: string; binding: string } | null = null;
    const blocked = () => !!document.querySelector('[role="dialog"], .font-popover, .action-menu[open]');
    const release = (restore: boolean) => { if (held) { held = null; current.current.controls.release(restore); } };
    const down = (event: KeyboardEvent) => {
      const { shortcuts, controls } = current.current;
      if (!controls.enabled || blocked() || controls.composing() || event.isComposing || event.keyCode === 229) return;
      const editable = (event.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable="true"]');
      if (editable && !editable.matches('.blank-wrap input, .objective-options input')) return;
      const key = shortcutFromEvent(event), action = shortcutActions.find(action => !!key && shortcuts[action] === key);
      if (!action || (controls.allowed && !controls.allowed.includes(action))) return;
      if (event.key === 'Enter' && (event.target as HTMLElement)?.closest?.('button, a, summary')) return;
      event.preventDefault(); event.stopPropagation();
      if (event.repeat) return;
      if (action === 'answer') { held = { code: event.code, key: event.key, binding: key! }; }
      controls.action(action);
    };
    const up = (event: KeyboardEvent) => {
      if (!held) return;
      const modifier = ({Control:'Ctrl+', Alt:'Alt+', Shift:'Shift+'} as Record<string,string>)[event.key];
      const released = (held.code ? event.code === held.code : event.key === held.key) || (!!modifier && held.binding.includes(modifier));
      if (released) { event.preventDefault(); event.stopPropagation(); release(!blocked()); }
    };
    const blur = () => release(false);
    const visibility = () => { if (document.hidden) release(false); };
    window.addEventListener('keydown', down, true); window.addEventListener('keyup', up, true);
    window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility); release(false); };
  }, []);
}
