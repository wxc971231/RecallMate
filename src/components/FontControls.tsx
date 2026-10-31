import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, RotateCcw, Type, X } from 'lucide-react';
import { fontLimits, type AppSettings } from '../domain/settings';

export function FontControls({ settings, ready, change, reset, error }: {
  settings: AppSettings; ready: boolean; change(patch: Partial<AppSettings>): void; reset(): void; error: string;
}) {
  const [open, setOpen] = useState(false);
  const element = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const close = () => { setOpen(false); previousFocus.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const click = (event: PointerEvent) => { if (!element.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('pointerdown', click); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', click); document.removeEventListener('keydown', key); };
  }, [open]);
  return <div className="font-controls" ref={element}>
    <button className={`header-tool ${open ? 'selected' : ''}`} aria-expanded={open} aria-controls="font-popover" disabled={!ready}
      onPointerDown={() => { if (!open) previousFocus.current = document.activeElement as HTMLElement | null; }}
      onClick={() => { if (open) close(); else setOpen(true); }}><Type size={17} />字号</button>
    {open && <section className="font-popover" id="font-popover" aria-label="字号设置"><div className="popover-title"><strong>字号调整</strong><button className="icon-button" aria-label="关闭字号设置" onClick={close}><X size={17} /></button></div>
      {(['uiFontSize', 'practiceFontSize'] as const).map(name => {
        const label = name === 'uiFontSize' ? '界面字号' : '练习字号';
        const limits = fontLimits[name];
        return <div className="font-setting" key={name}><div className="font-setting-label"><label htmlFor={name}>{label}</label><output htmlFor={name}>{settings[name]} px</output></div>
          <div className="font-adjust"><button aria-label={`减小${label}`} disabled={settings[name] <= limits.min} onClick={() => change({ [name]: settings[name] - 1 })}><Minus size={16} /></button>
            <input id={name} aria-label={label} type="range" min={limits.min} max={limits.max} step={1} value={settings[name]} onChange={event => change({ [name]: Number(event.target.value) })} />
            <button aria-label={`增大${label}`} disabled={settings[name] >= limits.max} onClick={() => change({ [name]: settings[name] + 1 })}><Plus size={16} /></button></div></div>;
      })}
      <div className="font-preview">预览：输入答案，按 Enter 确认。</div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <button className="text-button" onClick={reset}><RotateCcw size={14} />恢复默认字号</button>
    </section>}
  </div>;
}
