import { useEffect, useState } from 'react';
import { Keyboard } from '@capacitor/keyboard';
import { isAndroid } from '../services/platform';

// Track the native IME, rather than input focus: Android can hide its keyboard
// while leaving the field focused, and a hardware keyboard may never open it.
export function useAndroidKeyboard() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!isAndroid) return;
    let disposed = false;
    const update = (value: boolean) => { if (!disposed) setVisible(value); };
    const listeners = [
      Keyboard.addListener('keyboardWillShow', () => update(true)),
      Keyboard.addListener('keyboardDidShow', () => update(true)),
      Keyboard.addListener('keyboardWillHide', () => update(false)),
      Keyboard.addListener('keyboardDidHide', () => update(false)),
    ];
    return () => { disposed = true; listeners.forEach(listener => { void listener.then(handle => handle.remove()); }); };
  }, []);
  return visible;
}
