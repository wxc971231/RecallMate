import { useEffect, useRef } from 'react';
import { App } from '@capacitor/app';
import { isAndroid } from '../services/platform';

export function useAndroidNavigation(back: () => Promise<void>) {
  const current = useRef(back); current.current = back;
  useEffect(() => {
    if (!isAndroid) return;
    let busy = false, disposed = false;
    const pending = App.addListener('backButton', () => {
      if (busy || disposed) return;
      busy = true;
      void current.current().finally(() => { busy = false; });
    });
    return () => { disposed = true; void pending.then(listener => listener.remove()); };
  }, []);
}
