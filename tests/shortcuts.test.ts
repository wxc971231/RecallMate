import { describe, expect, it } from 'vitest';
import { defaultShortcuts, normalizeShortcut, shortcutFromEvent, validateShortcuts } from '../src/domain/shortcuts';
import { defaultSettings, validateSettings } from '../src/domain/settings';

describe('Windows 答题快捷键', () => {
  it('默认使用功能键，放弃需要 Shift，确认仍为 Enter', () => expect(defaultShortcuts).toEqual({answer:'F1',hint:'F2',giveUp:'Shift+F3',skip:'F4',submit:'Enter'}));
  it('旧版字号设置补齐快捷键，原字号不变', () => expect(validateSettings({schemaVersion:1,uiFontSize:18,practiceFontSize:36})).toEqual({schemaVersion:1,uiFontSize:18,practiceFontSize:36,shortcuts:defaultShortcuts}));
  it('组合键大小写和修饰键顺序标准化后再检查冲突', () => {
    expect(normalizeShortcut('shift + ctrl + h')).toBe('Ctrl+Shift+H');
    expect(()=>validateShortcuts({...defaultShortcuts,answer:'ctrl+shift+h',hint:'Shift+Ctrl+H'})).toThrow('同时用于');
  });
  it.each(['a','A','1','Shift+H','Shift+2','Escape','Tab','Backspace','Delete','Ctrl+Ctrl+H','Meta+F2','F13'])('拒绝会影响输入或无法稳定表示的 %s', key=>expect(()=>normalizeShortcut(key)).toThrow());
  it.each(['Alt+F4','F5','F11','F12','Ctrl+R','Ctrl+W','Ctrl+C','Ctrl+V','Ctrl+A','Ctrl+Z','Ctrl+Shift+I'])('拒绝系统或编辑保留键 %s', key=>expect(()=>normalizeShortcut(key)).toThrow());
  it('支持停用任意动作，但不接受缺项和错误类型', () => {
    expect(validateShortcuts({...defaultShortcuts,answer:null,submit:null})).toMatchObject({answer:null,submit:null});
    expect(()=>validateShortcuts({hint:'F2'})).toThrow('缺少'); expect(()=>validateShortcuts({...defaultShortcuts,hint:32})).toThrow();
  });
  it('按键匹配包含全部修饰键，主键区和小键盘 Enter 相同', () => {
    const event={key:'F3',ctrlKey:false,altKey:false,shiftKey:false,metaKey:false};
    expect(shortcutFromEvent(event)).toBe('F3'); expect(shortcutFromEvent({...event,shiftKey:true})).toBe('Shift+F3');
    expect(shortcutFromEvent({...event,key:'Enter'})).toBe('Enter');
    expect(shortcutFromEvent({...event,key:'Control',ctrlKey:true})).toBeNull(); expect(shortcutFromEvent({...event,key:'a'})).toBeNull();
  });
  it('校验和编辑快捷键不会修改全局默认值', () => {
    const value=validateSettings({...defaultSettings}); value.shortcuts.hint='F6';
    expect(defaultShortcuts.hint).toBe('F2'); expect(defaultSettings.shortcuts.hint).toBe('F2');
  });
});
