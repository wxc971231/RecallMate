import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, Check, Eye, Flag, Lightbulb, RotateCcw } from 'lucide-react';
import { parseQuestion } from '../domain/parser';
import { hasHelp, type PracticeAction } from '../domain/practice';
import { assessBlanks, feedbackLabel } from '../domain/answerMatcher';
import type { Bundle, PracticeMode } from '../domain/types';
import { isAndroid, isDesktop } from '../services/platform';
import { Keyboard } from '@capacitor/keyboard';
import { shortcutAria, shortcutNames, type ShortcutAction, type Shortcuts } from '../domain/shortcuts';
import { usePracticeShortcuts } from '../hooks/usePracticeShortcuts';

const modeNames: Record<PracticeMode, string> = { all: '顺序练习', random: '随机练习', wrong: '错题复习', single: '单题练习', 'round-wrong': '本轮错题' };
export function PracticePage({ bundle, fontSize, shortcuts, dispatch, exit, restart }: {
  bundle: Bundle; fontSize: number; shortcuts: Shortcuts; dispatch(action: PracticeAction, debounce?: boolean): void;
  exit(): void; restart(mode: PracticeMode, ids?: string[]): void;
}) {
  const session = bundle.session!;
  const attempt = session.currentAttempt;
  const [showAnswer, setShowAnswer] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const [composingIndex, setComposingIndex] = useState<number | null>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const composing = useRef(false);
  const compositionEndAt = useRef(0);
  const peekActive = useRef(false);
  const peekHadFocus = useRef(false);
  const caret = useRef<{ start: number | null; end: number | null } | null>(null);
  const clickTime = useRef(0);
  const attemptRef = useRef(attempt); attemptRef.current = attempt;
  const shortcutHandler = useRef<(action: ShortcutAction) => void>(() => {});

  const hide = (restore = true) => {
    if (!peekActive.current) return;
    peekActive.current = false; setShowAnswer(false);
    if (restore && (!isAndroid || peekHadFocus.current)) requestAnimationFrame(() => {
      const input = inputs.current[attemptRef.current?.activeBlankIndex ?? 0];
      input?.focus({ preventScroll: isAndroid });
      if (input && caret.current?.start != null) input.setSelectionRange(caret.current.start, caret.current.end);
    });
  };
  useEffect(() => {
    const release = () => hide();
    const blur = () => hide(false);
    const visibility = () => { if (document.hidden) hide(false); };
    window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release);
    window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => {
    peekActive.current = false; setShowAnswer(false);
    if (!attempt || session.isFinished) return;
    const input = inputs.current[attempt.activeBlankIndex];
    if (!isAndroid || focusTick) input?.focus();
    if (focusTick && input) input.setSelectionRange(input.value.length, input.value.length);
  }, [attempt?.id, attempt?.activeBlankIndex, focusTick, session.isFinished]);
  useEffect(() => {
    if (!isAndroid) return;
    const listener = Keyboard.addListener('keyboardDidShow', () => {
      inputs.current[attemptRef.current?.activeBlankIndex ?? 0]?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    });
    return () => { void listener.then(handle => handle.remove()); };
  }, []);
  useEffect(() => {
    inputs.current.forEach(input => {
      if (input?.nextElementSibling instanceof HTMLElement && input.nextElementSibling.classList.contains('source-overlay')) input.nextElementSibling.scrollLeft = input.scrollLeft;
    });
  });

  usePracticeShortcuts(shortcuts, {
    enabled: !!attempt && !session.isFinished,
    composing: () => composing.current || performance.now() - compositionEndAt.current < 80,
    action: action => shortcutHandler.current(action), release: hide,
  });
  if (session.isFinished) {
    const summaries = session.summaries;
    const wrongIds = [...new Set(summaries.filter(s => s.wrong || s.help).map(s => s.questionId))];
    return <div className="summary-page">
      <button className="back-link" onClick={exit}><ArrowLeft size={17} /> 返回题库</button>
      <div className="summary-card"><h1>本轮练习完成</h1>
        <div className="summary-grid">{[
          ['练习题数', summaries.length], ['独立完成', summaries.filter(s => s.independent).length],
          ['答错题数', summaries.filter(s => s.wrong).length], ['求助题数', summaries.filter(s => s.help).length],
          ['跳过题数', summaries.filter(s => s.skipped).length], ['本轮错题', wrongIds.length],
        ].map(([label, count]) => <div key={label}><strong>{count}</strong><span>{label}</span></div>)}</div>
        <div className="button-row centered"><button className="secondary" onClick={exit}>返回题库</button><button className="primary" disabled={!wrongIds.length} onClick={() => restart('round-wrong', wrongIds)}><RotateCcw size={16} /> 重练本轮错题</button></div>
      </div>
    </div>;
  }
  if (!attempt) return null;
  const question = bundle.bank.questions.find(q => q.id === attempt.questionId)!;
  const parsed = parseQuestion(question.sourceText);
  const comparisons = assessBlanks(attempt.blanks, parsed, attempt.strictBlankOrder ?? false);
  const terminal = attempt.status !== 'active';
  const submit = () => { if (!composing.current && !peekActive.current) { dispatch({ type: 'submit' }); setFocusTick(t => t + 1); } };
  const fastAction = (action: PracticeAction) => {
    if (performance.now() - clickTime.current < 250 || peekActive.current) return;
    clickTime.current = performance.now(); dispatch(action); setFocusTick(t => t + 1);
  };
  const peek = () => {
    if (peekActive.current) return;
    const input = inputs.current[attempt.activeBlankIndex];
    peekHadFocus.current = document.activeElement === input;
    caret.current = input ? { start: input.selectionStart, end: input.selectionEnd } : null;
    peekActive.current = true; setShowAnswer(true); dispatch({ type: 'view' });
  };
  shortcutHandler.current = action => {
    if (action === 'answer') peek();
    else if (action === 'submit') {
      if (!peekActive.current) { dispatch({ type: terminal ? 'next' : 'submit' }); setFocusTick(t => t + 1); }
    }
    else if (!terminal && action === 'hint' && !comparisons.every(c => c.correct)) fastAction({ type: 'hint' });
    else if (!terminal && action === 'giveUp') fastAction({ type: 'give-up' });
    else if (!terminal && action === 'skip') fastAction({ type: 'next' });
  };
  const shortcutProps = (action: ShortcutAction) => isDesktop ? { title: shortcuts[action] ? `${shortcutNames[action]}（${shortcuts[action]}）` : shortcutNames[action], 'data-shortcut': shortcuts[action] ?? undefined, 'aria-keyshortcuts': shortcutAria(shortcuts[action]) } : {};
  const confirmInstruction = isAndroid ? '点击“确认答案”' : shortcuts.submit ? `按 ${shortcuts.submit} 确认当前答案` : '点击“确认答案”';
  const pendingFeedback = comparisons.filter((comparison, i) => attempt.blanks[i].status !== 'unjudged' && !comparison.correct);
  const statusText = attempt.status === 'completed' ? (isAndroid || !shortcuts.submit ? '全部答对，点击“下一题”继续' : `全部答对，按 ${shortcuts.submit} 进入下一题`) : attempt.status === 'abandoned' ? '已补全答案，黄色部分由系统补写' : pendingFeedback.some(c => c.duplicate) ? '有重复项目，每个正确选项只能使用一次' : pendingFeedback.length ? pendingFeedback.some(c => c.chars.includes('incorrect')) ? '已标出匹配部分，请修改标红内容后重新提交' : `还有遗漏，补全后${confirmInstruction}` : confirmInstruction;
  return <div className="practice-page">
    <div className="practice-top"><button className="back-link" onClick={exit}><ArrowLeft size={17} /> 退出练习</button><div className="practice-bank">{bundle.bank.name}<span>{modeNames[session.mode]}</span></div><span className="progress-count"><b>{session.currentIndex + 1}</b> / {session.questionIds.length}</span></div>
    <div className="progress-track"><div style={{ width: `${session.currentIndex / session.questionIds.length * 100}%` }} /></div>
    <section className="question-card">
      <div className="question-meta"><span>第 {session.currentIndex + 1} 题 · {parsed.answers.length} 个填空</span>{isDesktop && attempt.strictBlankOrder && <span className="strict-mode-label" title="本题按文档顺序判题">严格模式</span>}{hasHelp(attempt) && <span>已使用帮助</span>}</div>
      <div className="question-text" role={isAndroid ? 'region' : undefined} aria-label={isAndroid ? '题目与填空，可上下滚动' : undefined}>{parsed.fragments.map((fragment, i) => <span key={`${attempt.id}-${i}`}>
        {fragment}{i < parsed.answers.length && (() => {
          const blank = attempt.blanks[i];
          const comparison = comparisons[i];
          const judged = blank.status !== 'unjudged' && attempt.status !== 'abandoned';
          const hasSources = blank.charSources.some(s => s !== 'user');
          const visual = showAnswer ? parsed.answers[comparison.targetIndex][0] : blank.value;
          const hasLineBreak = /[\n\r]/.test(visual);
          const expanded = hasLineBreak || Array.from(visual).length > 22;
          const width = Math.min(800, Math.max(fontSize * 4.5, Array.from(visual).reduce((n, c) => n + (/[^\x00-\xff]/.test(c) ? fontSize * 1.04 : fontSize * .64), fontSize * 1.6)));
          return <span className={`blank-group ${expanded ? 'expanded' : ''}`}>
            <span className={`blank-wrap ${blank.status} ${showAnswer ? 'peeking' : ''} ${attempt.status === 'abandoned' ? 'given-up' : ''}`} style={{ '--blank-width': `${width}px` } as CSSProperties}>
              <input ref={element => { inputs.current[i] = element; }} aria-label={`第 ${i + 1} 个填空`} autoComplete="off" autoCapitalize="off" autoCorrect="off" enterKeyHint="done" spellCheck={false}
                className={(hasSources || judged) && !showAnswer && composingIndex !== i ? 'has-sources' : ''}
                value={blank.value}
                readOnly={(!isAndroid && showAnswer) || attempt.status === 'abandoned'} placeholder=""
                onBeforeInput={event => { if (peekActive.current) event.preventDefault(); }}
                onFocus={event => { if (i !== attempt.activeBlankIndex) dispatch({ type: 'focus', index: i }, true); if (isAndroid) { const target = event.currentTarget; setTimeout(() => target.isConnected && target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }), 250); } }}
                onChange={event => { if (!peekActive.current) dispatch({ type: 'edit', index: i, value: event.target.value }, true); }}
                onCompositionStart={() => { composing.current = true; setComposingIndex(i); }}
                onCompositionEnd={() => { composing.current = false; setComposingIndex(null); compositionEndAt.current = performance.now(); }}
                onScroll={event => { const overlay = event.currentTarget.nextElementSibling; if (overlay instanceof HTMLElement && overlay.classList.contains('source-overlay')) overlay.scrollLeft = event.currentTarget.scrollLeft; }}
                onKeyDown={event => {
                  if (isDesktop) return;
                  if (event.key !== 'Enter') return;
                  if (event.nativeEvent.isComposing || composing.current || event.keyCode === 229) return;
                  event.preventDefault();
                  if (event.repeat || performance.now() - compositionEndAt.current < 80 || peekActive.current) return;
                  submit();
                }} />
              {(showAnswer || ((hasSources || judged) && composingIndex !== i)) && <span className={`source-overlay ${showAnswer ? 'answer-overlay' : ''}`} aria-hidden="true">{Array.from(visual || ' ').map((char, j) => <span key={j} className={showAnswer ? '' : `source-${blank.charSources[j] ?? 'user'} ${judged ? `judge-${comparison.chars[j] ?? 'neutral'}` : ''}`}>{char}</span>)}</span>}
              {!showAnswer && blank.status === 'correct' && <Check className="blank-check" size={14} />}
            </span>
            <span className={`blank-label ${blank.status}`}>{showAnswer ? '标准答案' : judged ? feedbackLabel(comparison) : hasSources ? '含提示' : attempt.activeBlankIndex === i ? `第 ${i + 1} 空` : '\u00a0'}</span>
          </span>;
        })()}
      </span>)}</div>
      {(!isAndroid || terminal || pendingFeedback.length > 0) && <div className={`question-feedback ${terminal ? 'positive' : ''}`} role="status">{statusText}</div>}
    </section>
    <div className="practice-actions">
      <div className="help-actions"><button className="tool-button answer-button" {...shortcutProps('answer')} onPointerDown={e => { e.preventDefault(); peek(); }} onPointerLeave={() => hide()} onPointerUp={() => hide()} onPointerCancel={() => hide()} onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); peek(); } }} onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); hide(); } }} onBlur={() => hide(false)}><Eye size={18} /><span>答案（按住）</span></button>
        <button className="tool-button hint-button" {...shortcutProps('hint')} disabled={terminal || showAnswer || comparisons.every(c => c.correct)} onPointerDown={event => { if (isAndroid) event.preventDefault(); }} onClick={() => fastAction({ type: 'hint' })}><Lightbulb size={18} /><span>提示</span></button>
        <button className="tool-button give-up-button" {...shortcutProps('giveUp')} disabled={terminal || showAnswer} onClick={() => fastAction({ type: 'give-up' })}><Flag size={18} /><span>放弃</span></button>
        {!terminal && <button className="tool-button skip-button" {...shortcutProps('skip')} disabled={showAnswer} onClick={() => fastAction({ type: 'next' })}>跳过</button>}
      </div>
      <div className="button-row">{!terminal ? <button className="primary submit-button" {...shortcutProps('submit')} disabled={showAnswer} onClick={submit}>确认答案 <kbd>{isDesktop ? shortcuts.submit : '↵'}</kbd></button> : <button className="primary" {...shortcutProps('submit')} disabled={showAnswer} onClick={() => fastAction({ type: 'next' })}>下一题<ArrowRight size={17} /></button>}</div>
    </div>
  </div>;
}
