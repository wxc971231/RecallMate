import { Capacitor } from '@capacitor/core';

export const isAndroid = Capacitor.getPlatform() === 'android';
export const isDesktop = typeof window !== 'undefined' && !!window.recallmate && !isAndroid;
export const isPreview = !isAndroid && !isDesktop;
export const appVersion = isAndroid ? 'Android 0.1.2' : 'v0.1.6';
