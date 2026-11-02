import { defaultShortcuts, validateShortcuts, type Shortcuts } from './shortcuts';
export interface AppSettings { schemaVersion: 1; uiFontSize: number; practiceFontSize: number; shortcuts: Shortcuts; strictBlankOrder: boolean }
export const defaultSettings: AppSettings = { schemaVersion: 1, uiFontSize: 14, practiceFontSize: 24, shortcuts: { ...defaultShortcuts }, strictBlankOrder: true };
export const fontLimits = { uiFontSize: { min: 12, max: 20 }, practiceFontSize: { min: 18, max: 40 } };
export function validateSettings(input: unknown): AppSettings {
  if (!input || typeof input !== 'object' || (input as AppSettings).schemaVersion !== 1) throw new Error('字号设置格式无效');
  const settings = input as AppSettings;
  for (const name of ['uiFontSize', 'practiceFontSize'] as const) {
    if (!Number.isInteger(settings[name]) || settings[name] < fontLimits[name].min || settings[name] > fontLimits[name].max) throw new Error('字号超出支持范围');
  }
  if (settings.strictBlankOrder !== undefined && typeof settings.strictBlankOrder !== 'boolean') throw new Error('填空严格模式设置无效');
  return { schemaVersion: 1, uiFontSize: settings.uiFontSize, practiceFontSize: settings.practiceFontSize, shortcuts: settings.shortcuts === undefined ? { ...defaultShortcuts } : validateShortcuts(settings.shortcuts), strictBlankOrder: settings.strictBlankOrder ?? true };
}
