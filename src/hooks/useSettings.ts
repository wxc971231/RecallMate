import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { defaultSettings, validateSettings, type AppSettings } from '../domain/settings';
import { storage } from '../services/storage';

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>({ ...defaultSettings });
  const current = useRef(settings);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<'saved' | 'pending' | 'error'>('saved');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const queue = useRef(Promise.resolve());
  const revision = useRef(0);
  const dirty = useRef(false);
  useEffect(() => {
    void storage.loadSettings().then(result => { current.current = result.settings; setSettings(result.settings); setWarning(result.warning ?? ''); setReady(true); })
      .catch(reason => { setWarning('设置读取失败：' + String(reason)); setReady(true); });
  }, []);
  useLayoutEffect(() => {
    document.documentElement.style.fontSize = `${settings.uiFontSize}px`;
    document.documentElement.style.setProperty('--practice-font-size', `${settings.practiceFontSize}px`);
  }, [settings]);
  const change = (patch: Partial<Omit<AppSettings, 'schemaVersion'>>) => {
    const next = validateSettings({ ...current.current, ...patch });
    current.current = next; setSettings(next); setStatus('pending'); setError(''); setWarning(''); dirty.current = true;
    const ownRevision = ++revision.current;
    const task = queue.current.catch(() => {}).then(() => storage.saveSettings(next));
    queue.current = task;
    task.then(() => { if (ownRevision === revision.current) { dirty.current = false; setStatus('saved'); } })
      .catch(reason => { if (ownRevision === revision.current) { setStatus('error'); setError('设置保存失败：' + (reason instanceof Error ? reason.message : String(reason))); } });
  };
  const flush = async () => { await queue.current; if (dirty.current) throw new Error('设置尚未保存，请重试'); };
  return { settings, ready, status, error, warning, change, reset: () => change({ uiFontSize: defaultSettings.uiFontSize, practiceFontSize: defaultSettings.practiceFontSize }), retry: () => change({}), flush };
}
