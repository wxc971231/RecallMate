import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, Flag } from 'lucide-react';
import { gradeObjective, type ObjectiveAnswer } from '../domain/objectiveGrading';
import { questionTypeNames, type Bundle, type ObjectiveAttempt, type ObjectiveQuestion } from '../domain/types';
import { shortcutAria, type ShortcutAction, type Shortcuts } from '../domain/shortcuts';
import type { PracticeAction } from '../domain/practice';
import { usePracticeShortcuts } from '../hooks/usePracticeShortcuts';
import { isAndroid, isDesktop } from '../services/platform';
import { AnswerFeedback } from './AnswerFeedback';

export function ObjectivePracticePage({ bundle, question, attempt, fontSize, shortcuts, dispatch, exit }: { bundle: Bundle; question: ObjectiveQuestion; attempt: ObjectiveAttempt; fontSize: number; shortcuts: Shortcuts; dispatch(action: PracticeAction, debounce?: boolean): void; exit(): void }) {
  const session = bundle.session!;
  const minimal=isDesktop||isAndroid;
  const [emptyWarning, setEmptyWarning] = useState(false);
  const choices = useRef<HTMLFieldSetElement>(null), lastClick = useRef(0);
  const terminal = attempt.status !== 'active', submitted = attempt.status === 'submitted';
  const result = gradeObjective(question, attempt.selectedAnswer);
  const send = (action: PracticeAction) => dispatch({ ...action, expectedAttemptId: attempt.id });
  const submit = () => { if (terminal) return; if (result.empty) { setEmptyWarning(true); choices.current?.querySelector<HTMLInputElement>('input')?.focus(); return; } lastClick.current=performance.now(); setEmptyWarning(false); send({ type: 'submit' }); };
  const fast = (type: 'give-up' | 'next') => { if (performance.now() - lastClick.current < 250) return; lastClick.current = performance.now(); send({ type }); };
  useEffect(() => {
    if(isAndroid)void import('@capacitor/keyboard').then(({Keyboard})=>Keyboard.hide()).catch(()=>{});
    setEmptyWarning(false);
    choices.current?.closest('.objective-body')?.scrollTo(0,0);
    const focused=document.activeElement;
    if(focused instanceof HTMLElement&&choices.current?.closest('.practice-page')?.contains(focused))focused.blur();
  }, [attempt.id]);
  usePracticeShortcuts(shortcuts, { enabled: true, allowed: ['submit','giveUp','skip'], composing: () => false, action: action => { if (action === 'submit') { if (terminal) fast('next'); else submit(); } else if (!terminal && action === 'giveUp') fast('give-up'); else if (!terminal && action === 'skip') fast('next'); }, release: () => {} });
  const attrs = (action: ShortcutAction) => isDesktop ? { 'data-shortcut': shortcuts[action] ?? undefined, 'aria-keyshortcuts': shortcutAria(shortcuts[action]) } : {};
  const selected = (id: string) => question.type === 'true_false' ? attempt.selectedAnswer === (id === 'true') : typeof attempt.selectedAnswer === 'string' ? attempt.selectedAnswer === id : Array.isArray(attempt.selectedAnswer) && attempt.selectedAnswer.includes(id);
  const options = question.type === 'true_false' ? [{id:'true',text:'正确'},{id:'false',text:'错误'}] : question.options;
  const expected = question.type === 'true_false' ? [String(question.answer)] : question.type === 'single_choice' ? [question.answer] : question.answer;
  const label = (ids: string[]) => ids.map(id => question.type === 'true_false' ? id === 'true' ? '正确' : '错误' : String.fromCharCode(65 + options.findIndex(o => o.id === id))).join('、');
  const userIds = options.filter(o => selected(o.id)).map(o => o.id);
  const choose = (id: string) => { if (terminal) return; setEmptyWarning(false); let value: ObjectiveAnswer;
    if (question.type === 'true_false') value = id === 'true';
    else if (question.type === 'single_choice') value = id;
    else value = selected(id) ? userIds.filter(v => v !== id) : [...userIds, id];
    send({type:'select',value});
  };
  return <div className="practice-page objective-practice" data-question-type={question.type} style={{'--practice-font-size':`${fontSize}px`} as CSSProperties}>
    {!minimal&&<><div className="practice-top"><button className="back-link" onClick={exit}><ArrowLeft size={17}/>退出练习</button><div className="practice-bank">{bundle.bank.name}</div><span className="progress-count"><b>{session.currentIndex+1}</b> / {session.questionIds.length}</span></div>
    <div className="progress-track"><div style={{width:`${session.currentIndex/session.questionIds.length*100}%`}}/></div>
    </>}<section className="question-card objective-card">{(!minimal||isAndroid)&&<div className="question-meta mobile-question-meta"><span>第 {session.currentIndex+1} 题 · {questionTypeNames[question.type]}{question.label ? ` · ${question.label}` : ''}</span>{terminal && !submitted && <span>已使用帮助</span>}</div>}
      <div className="objective-body"><div className="objective-stem">{question.sourceText}</div>
        <fieldset className="objective-options" ref={choices} disabled={terminal}><legend className="sr-only">{question.type === 'multiple_choice' ? '选择所有应选项' : question.type === 'true_false' ? '判断正确或错误' : '选择一个选项'}</legend>{options.map((option,index) => {
          const should = expected.includes(option.id), isSelected = selected(option.id);
          const state = !terminal ? '' : should ? isSelected || question.type !== 'multiple_choice' ? 'option-correct' : 'option-missing' : submitted && isSelected ? 'option-incorrect' : '';
          return <label className={`objective-option ${isSelected?'selected':''} ${state}`} key={option.id}><input type={question.type === 'multiple_choice'?'checkbox':'radio'} name={`answer-${attempt.id}`} value={option.id} checked={isSelected} onChange={()=>choose(option.id)} /><span className="option-letter">{question.type === 'true_false' ? '' : String.fromCharCode(65+index)+'.'}</span><span className="option-text">{option.text}</span>{terminal && <span className="option-verdict">{should ? !isSelected && question.type === 'multiple_choice' && submitted ? '漏选' : '本题应选' : submitted && isSelected ? '错选' : ''}</span>}</label>;
        })}</fieldset>
        {emptyWarning && <p className="inline-error" role="alert">{question.type==='true_false'?'请先选择正确或错误':'请先选择答案'}</p>}
        {terminal && <div className="objective-feedback"><div className="objective-result-line"><div className={`question-feedback ${submitted ? result.correct?'positive':'negative':''}`} role="status">{submitted ? result.correct?'本题答对':'本题答错':'已查看答案，本题记一次求助'}</div><p>你的{!submitted?'原选择':'答案'}：{label(userIds)||'未选择'}　　本题应选：{label(expected)}</p></div>{submitted && question.type==='multiple_choice' && (!!result.missingOptionIds.length || !!result.extraOptionIds.length) && <p className="selection-diff">{!!result.missingOptionIds.length && <span>漏选：{label(result.missingOptionIds)}</span>}{!!result.extraOptionIds.length && <span>错选：{label(result.extraOptionIds)}</span>}</p>}<AnswerFeedback question={question} knowledgePoints={bundle.bank.knowledgePoints}/></div>}
      </div>
    </section>
    <div className="practice-actions"><div className="help-actions">{!terminal && <><button className="tool-button give-up-button" {...attrs('giveUp')} onClick={()=>fast('give-up')}><Flag size={18}/>不会／看答案</button><button className="tool-button skip-button" {...attrs('skip')} onClick={()=>fast('next')}>跳过</button></>}</div><div className="button-row">{terminal ? <button className="primary" {...attrs('submit')} onClick={()=>fast('next')}>下一题<ArrowRight size={17}/></button> : <button className="primary submit-button" {...attrs('submit')} onClick={submit}>提交答案{isDesktop && shortcuts.submit && <kbd>{shortcuts.submit}</kbd>}</button>}</div></div>
  </div>;
}
