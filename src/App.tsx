import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronDown, Clock3, Download, FileText, FolderOpen, HelpCircle, Leaf, MoreHorizontal, Pencil, Play, Plus, Search, Settings2, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { createBank, deleteQuestion, dismissWrongQuestion, validateBundle } from './domain/banks';
import { parseQuestion, parseQuestionFile } from './domain/parser';
import { emptyStats, practiceAction, sortWrongQuestions, startSession, type PracticeAction } from './domain/practice';
import type { Bundle, PracticeMode, Question } from './domain/types';
import { flushSaves, removeBundle, saveBundle, storage } from './services/storage';
import { sampleText } from './sample';
import { PracticePage } from './components/PracticePage';
import { FontControls } from './components/FontControls';
import { useSettings } from './hooks/useSettings';

type Route = { type: 'home' | 'wrong' } | { type: 'detail' | 'practice'; id: string };
type Confirm = { title: string; message: string; danger?: boolean; label?: string; action(): void | Promise<void> };
const dateLabel = (date?: string) => date ? new Date(date).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '尚未练习';
const wrongCount = (b: Bundle) => b.bank.questions.filter(q => b.bank.stats[q.id]?.inWrongBook).length;
function previewText(source: string) { return source.replace(/\{\{.*?\}\}/gs, '______'); }

function Modal({ title, subtitle, children, close, wide = false }: { title: string; subtitle?: string; children: ReactNode; close(): void; wide?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(container.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select, [tabindex="0"]') ?? []).filter(el => el.offsetParent !== null);
    focusable()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== container.current) return;
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') {
        const elements = focusable(), first = elements[0], last = elements.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><div ref={container} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="关闭弹窗" onClick={close}><X size={20} /></button></header>{children}</div></div>;
}

function ImportModal({ initialText, close, imported, choose }: { initialText: string; close(): void; imported(bundle: Bundle): void; choose(): Promise<void> }) {
  const [text, setText] = useState(initialText);
  const [name, setName] = useState('');
  const parsed = useMemo(() => parseQuestionFile(text), [text]);
  return <Modal title="导入题库" subtitle="选择 Markdown / TXT / JSON 文件，或直接粘贴题目。" close={close} wide>
    <button className="file-drop" onClick={choose}><Upload size={24} /><span><b>选择本地文件</b><small>支持 UTF-8 .md / .txt，以及 RecallMate .json 备份</small></span><ArrowRight size={18} /></button>
    <div className="import-grid"><div><label className="field-label" htmlFor="import-text">题目原文 <span>使用 {'{{答案}}'} 标记填空，独占行 --- 分题</span></label><textarea id="import-text" className="code-input" value={text} onChange={e => setText(e.target.value)} placeholder={'# 我的题库\n\n水的化学式为{{H₂O|H2O}}。\n\n---\n\n光合作用发生在{{叶绿体}}中。'} /><label className="field-label" htmlFor="bank-name">题库名称</label><input id="bank-name" className="text-input" maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder={parsed.name || '我的新题库'} /></div>
      <div className="import-preview"><div className="preview-title"><Sparkles size={16} /> 导入预览</div><h3>{name || parsed.name || '我的新题库'}</h3><div className="preview-counts"><span><b>{parsed.questions.length}</b> 道题目</span><span><b>{parsed.blankCount}</b> 个填空</span></div>
        {text.trim() && parsed.errors.length > 0 ? <div className="parse-errors">{parsed.errors.slice(0, 8).map((e, i) => <p key={i}>第 {e.line} 行{e.question > 0 && ` · 第 ${e.question} 题`}：{e.message}</p>)}</div> : parsed.questions.slice(0, 3).map((q, i) => <div className="preview-question" key={i}><span>{String(i + 1).padStart(2, '0')}</span><p>{q.fragments.map((f, j) => <span key={j}>{f}{j < q.answers.length && <mark>{q.answers[j][0]}</mark>}</span>)}</p></div>)}
        {!text.trim() && <div className="preview-placeholder"><FileText size={30} /><p>填写题目后查看预览</p></div>}
        {parsed.questions.length > 3 && <small className="muted">仅预览前 3 题，其余题目也会一并导入。</small>}
      </div></div>
    <footer className="modal-footer"><button className="text-button" onClick={() => { setText(sampleText); setName(''); }}>试试 20 道示例题</button><div className="button-row"><button className="secondary" onClick={close}>取消</button><button className="primary" disabled={!!parsed.errors.length || !parsed.questions.length} onClick={() => { const b = createBank(text, name.trim() || '我的新题库'); if (name.trim()) b.bank.name = name.trim(); imported(b); }}>导入 {parsed.questions.length || ''} 道题目 <ArrowRight size={16} /></button></div></footer>
  </Modal>;
}

function EditorModal({ question, close, save }: { question?: Question; close(): void; save(text: string): void }) {
  const [text, setText] = useState(question?.sourceText ?? '');
  const parsed = useMemo(() => parseQuestionFile(text), [text]);
  const valid = !parsed.errors.length && parsed.questions.length === 1;
  return <Modal title={question ? '编辑题目' : '添加一道新题'} subtitle="用 {{答案}} 设置填空，用 | 添加可接受的其他答案。" close={close} wide>
    <label className="field-label" htmlFor="question-source">题目原文</label><textarea id="question-source" className="code-input editor-text" value={text} onChange={e => setText(e.target.value)} placeholder="光合作用的能量来源是{{光能}}，主要发生在{{叶绿体}}中。" />
    <div className="editor-preview"><span className="eyebrow">实时预览</span>{valid ? <p>{parsed.questions[0].fragments.map((f, i) => <span key={i}>{f}{i < parsed.questions[0].answers.length && <mark>{parsed.questions[0].answers[i].join(' / ')}</mark>}</span>)}</p> : <p className="muted">{text ? parsed.errors[0]?.message ?? '一次只能编辑一道题，请移除分题线' : '输入一道题目，预览会出现在这里。'}</p>}</div>
    <footer className="modal-footer"><span className="muted">保存题目时会清除当前练习进度，保留其他题目的历史统计。</span><div className="button-row"><button className="secondary" onClick={close}>取消</button><button className="primary" disabled={!valid} onClick={() => save(parsed.questions[0].sourceText)}>保存题目</button></div></footer>
  </Modal>;
}

export default function App() {
  const preferences = useSettings();
  const [page, setPage] = useState(1);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const data = useRef<Bundle[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [route, setRoute] = useState<Route>({ type: 'home' });
  const [search, setSearch] = useState('');
  const [detailTab, setDetailTab] = useState<'all' | 'wrong'>('all');
  const [recentSort, setRecentSort] = useState(false);
  const [importText, setImportText] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ bankId: string; question?: Question } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null);
  const [info, setInfo] = useState<'settings' | 'help' | null>(null);
  const [dataPath, setDataPath] = useState('');
  const [notice, setNotice] = useState<{ message: string; error?: boolean } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<'saved' | 'pending' | 'error'>('saved');
  const [confirmBusy, setConfirmBusy] = useState(false);
  const pending = useRef(new Map<string, Bundle>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(0);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = (message: string, error = false) => { if (noticeTimer.current) clearTimeout(noticeTimer.current); setNotice({ message, error }); noticeTimer.current = setTimeout(() => setNotice(null), error ? 10000 : 4500); };
  const run = async (action: () => void | Promise<void>) => { try { await action(); } catch (error) { notify(error instanceof Error ? error.message : String(error), true); } };
  const refresh = (next: Bundle[]) => { data.current = next; setBundles(next); };
  const flushPending = async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const snapshots = [...pending.current.values()]; pending.current.clear();
    inFlight.current += snapshots.length;
    try {
      await Promise.all(snapshots.map(async b => {
        try { await saveBundle(b); }
        catch (error) { if (!pending.current.has(b.bank.id)) pending.current.set(b.bank.id, data.current.find(x => x.bank.id === b.bank.id) ?? b); throw error; }
        finally { inFlight.current--; }
      }));
      if (!pending.current.size && !inFlight.current) setSaveState('saved');
    } catch (error) { setSaveState('error'); notify('保存失败，请保留窗口并点击右下角“重试保存”。' + (error instanceof Error ? error.message : ''), true); throw error; }
  };
  const update = (bundle: Bundle, debounce = false) => {
    const next = data.current.some(b => b.bank.id === bundle.bank.id) ? data.current.map(b => b.bank.id === bundle.bank.id ? bundle : b) : [...data.current, bundle];
    refresh(next); pending.current.set(bundle.bank.id, bundle); setSaveState('pending');
    if (timer.current) clearTimeout(timer.current);
    if (debounce) timer.current = setTimeout(() => { void flushPending().catch(() => {}); }, 400);
    else void flushPending().catch(() => {});
  };
  useEffect(() => {
    void storage.load().then(result => { refresh(result.bundles); setWarnings(result.warnings); setLoaded(true); }).catch(error => { setWarnings(['数据读取失败：' + error.message]); setLoaded(true); });
    void storage.dataDirectory().then(setDataPath).catch(() => {});
    return storage.onBeforeClose(async () => { await flushPending(); await preferences.flush(); await flushSaves(); });
  }, []);
  const navigate = (next: Route) => { setSearch(''); setPage(1); setRoute(next); };
  const current = 'id' in route ? bundles.find(b => b.bank.id === route.id) : undefined;
  const totalQuestions = bundles.reduce((n, b) => n + b.bank.questions.length, 0);
  const totalWrong = bundles.reduce((n, b) => n + wrongCount(b), 0);
  const detail = (id: string, tab: 'all' | 'wrong' = 'all') => { setDetailTab(tab); setRecentSort(false); navigate({ type: 'detail', id }); };
  const start = (id: string, mode: PracticeMode = 'all', ids?: string[], force = false) => {
    const b = data.current.find(x => x.bank.id === id)!;
    const action = () => { update(startSession(data.current.find(x => x.bank.id === id)!, mode, ids)); navigate({ type: 'practice', id }); };
    if (!force && b.session && !b.session.isFinished) setConfirm({ title: '开始新的一轮？', message: '这会替换尚未完成的练习进度，已经产生的错题和历史统计会保留。', label: '开始新练习', action });
    else action();
  };
  const exportBank = (b: Bundle) => run(async () => { await flushPending(); await flushSaves(); if (await storage.exportFile(b)) notify(window.recallmate ? '已导出至数据目录的 exports 文件夹' : '题库与练习记录已下载'); });
  const importBundle = (b: Bundle) => { update(b); setImportText(null); detail(b.bank.id); notify(`已导入“${b.bank.name}”，共 ${b.bank.questions.length} 道题`); };
  const choose = async () => run(async () => {
    const file = await storage.chooseFile();
    if (!file) return;
    if (/\.json$/i.test(file.name)) {
      const imported = validateBundle(JSON.parse(file.text.replace(/^\uFEFF/, '')));
      if (data.current.some(b => b.bank.id === imported.bank.id)) setConfirm({ title: '覆盖同名题库的本地记录？', message: `备份“${imported.bank.name}”与现有题库 ID 相同。覆盖后，题目、统计和练习进度都会替换为备份内容。`, label: '覆盖并恢复', danger: true, action: () => importBundle(imported) });
      else importBundle(imported);
    } else setImportText(file.text);
  });
  const deleteBank = (b: Bundle) => setConfirm({ title: `删除“${b.bank.name}”？`, message: `此题库的 ${b.bank.questions.length} 道题目、历史记录和练习进度将一起删除，无法撤销。建议先导出备份。`, danger: true, label: '确认删除', action: async () => {
    await flushPending(); await flushSaves(); await removeBundle(b.bank.id); refresh(data.current.filter(x => x.bank.id !== b.bank.id)); navigate({ type: 'home' }); notify('题库已删除');
  } });
  const saveQuestion = (text: string) => {
    if (!editor) return;
    const b = data.current.find(x => x.bank.id === editor.bankId)!;
    const old = editor.question;
    const changedAnswer = old && JSON.stringify(parseQuestion(old.sourceText).answers) !== JSON.stringify(parseQuestion(text).answers);
    const apply = () => {
      const timestamp = new Date().toISOString(), q = { id: old?.id ?? crypto.randomUUID(), sourceText: text, createdAt: old?.createdAt ?? timestamp, updatedAt: timestamp };
      update({ schemaVersion: 1, bank: { ...b.bank, updatedAt: timestamp, questions: old ? b.bank.questions.map(x => x.id === old.id ? q : x) : [...b.bank.questions, q], stats: { ...b.bank.stats, [q.id]: old && !changedAnswer ? b.bank.stats[q.id] : emptyStats() } } });
      setEditor(null); notify('题目已保存');
    };
    if (changedAnswer) setConfirm({ title: '答案变更，重置本题统计？', message: '修改答案或填空顺序后，本题的历史统计将重置，当前练习进度也会清除。其他题目的统计会保留。', label: '确认保存', action: apply });
    else apply();
  };
  const removeWrong = (bankId: string, id: string) => {
    const b = data.current.find(x => x.bank.id === bankId)!;
    update(dismissWrongQuestion(b, id)); notify('已移出错题本，历史统计仍然保留');
  };


  const bankRow = (b: Bundle) => {
    const active = b.session && !b.session.isFinished;
    const last = Object.values(b.bank.stats).map(s => s.lastAttemptAt ?? '').sort().at(-1);
    return <tr className="bank-row" key={b.bank.id}>
      <td><div className="bank-name-cell"><FileText size={20} /><button className="bank-name" onClick={() => detail(b.bank.id)}>{b.bank.name}</button></div></td>
      <td className="numeric">{b.bank.questions.length}</td>
      <td className="numeric"><button className={wrongCount(b) ? 'wrong-count' : 'muted'} onClick={() => detail(b.bank.id, 'wrong')}>{wrongCount(b)}</button></td>
      <td className="last-practiced">{dateLabel(last)}</td>
      <td><div className="row-actions bank-actions">
        <button className="secondary" disabled={!b.bank.questions.length} title={active ? `上次学到 ${b.session!.currentIndex + 1} / ${b.session!.questionIds.length}` : undefined} onClick={() => { if (active) navigate({ type: 'practice', id: b.bank.id }); else start(b.bank.id); }}>{active ? '继续练习' : '开始练习'}</button>
        <button className="text-button" onClick={() => detail(b.bank.id)}>管理</button>
        <details className="action-menu"><summary aria-label={`${b.bank.name}的更多操作`}><MoreHorizontal size={19} /></summary><div>
          <button onClick={() => setRename({ id: b.bank.id, name: b.bank.name })}><Pencil size={15} />重命名</button>
          <button onClick={() => void exportBank(b)}><Download size={15} />导出备份</button>
          <button className="danger-text" onClick={() => deleteBank(b)}><Trash2 size={15} />删除题库</button>
        </div></details>
      </div></td>
    </tr>;
  };

  const questionRows = (b: Bundle, questions: Question[], wrongView: boolean) => <table className="question-list data-table">
    <colgroup><col className="number-column" /><col /><col className="blank-count-column" /><col className="question-actions-column" /></colgroup>
    <thead><tr><th>题号</th><th>题目</th><th className="numeric">填空</th><th className="actions-heading">操作</th></tr></thead>
    <tbody>{questions.map(q => {
      const stats = b.bank.stats[q.id] ?? emptyStats();
      const number = b.bank.questions.findIndex(x => x.id === q.id) + 1;
      return <tr className="question-row" key={q.id}>
        <td className="question-number">{String(number).padStart(2, '0')}</td>
        <td className="question-row-main"><p>{previewText(q.sourceText)}{stats.inWrongBook && !wrongView && <span className="wrong-tag">错题</span>}</p>
          {wrongView && <div className="question-tags"><span>答错 {stats.wrongAttemptCount} 次</span><span>求助 {stats.helpAttemptCount} 次</span><span>{stats.lastDifficultyType} · {dateLabel(stats.lastDifficultyAt)}</span></div>}
        </td>
        <td className="numeric muted">{parseQuestion(q.sourceText).answers.length}</td>
        <td><div className="row-actions">
          <button className="icon-button" title="练习这一题" aria-label={`练习第${number}题`} onClick={() => start(b.bank.id, 'single', [q.id])}><Play size={17} /></button>
          {wrongView ? <button className="icon-button" title="移出错题本" aria-label="移出错题本" onClick={() => removeWrong(b.bank.id, q.id)}><Check size={18} /></button> : <>
            <button className="icon-button" title="编辑题目" aria-label={`编辑第${number}题`} onClick={() => setEditor({ bankId: b.bank.id, question: q })}><Pencil size={17} /></button>
            <details className="action-menu"><summary aria-label={`第${number}题的更多操作`}><MoreHorizontal size={18} /></summary><div>
              <button onClick={() => start(b.bank.id, 'all', b.bank.questions.slice(number - 1).map(x => x.id))}>从本题开始练习</button>
              <button className="danger-text" onClick={() => setConfirm({ title: '删除这道题目？', message: '本题及其历史统计会被删除。如果本题是当前练习的题目，该轮练习进度也会清除。', danger: true, label: '删除题目', action: () => update(deleteQuestion(data.current.find(x => x.bank.id === b.bank.id)!, q.id)) })}>删除题目</button>
            </div></details>
          </>}
        </div></td>
      </tr>;
    })}</tbody>
  </table>;

  const pagination = (total: number) => {
    const pages = Math.max(1, Math.ceil(total / 10)), currentPage = Math.min(page, pages);
    const visible = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, pages])].filter(x => x >= 1 && x <= pages).sort((a, b) => a - b);
    return <div className="pagination"><span>共 {total} 题</span>{pages > 1 && <div>
      <button aria-label="上一页" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹</button>
      {visible.map((number, index) => <span key={number}>{index > 0 && number - visible[index - 1] > 1 && <span className="page-gap">…</span>}<button aria-label={`第${number}页`} aria-current={number === currentPage ? 'page' : undefined} className={number === currentPage ? 'selected' : ''} onClick={() => setPage(number)}>{number}</button></span>)}
      <button aria-label="下一页" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>›</button>
    </div>}</div>;
  };
  const combinedSave = saveState === 'error' || preferences.status === 'error' ? 'error' : saveState === 'pending' || preferences.status === 'pending' ? 'pending' : 'saved';

  return <div className="app-shell">
    <header className="app-header">
      <button className="brand" onClick={() => navigate({ type: 'home' })}><Leaf size={24} />RecallMate</button>
      <nav className="main-nav" aria-label="主导航">
        <button className={route.type !== 'wrong' ? 'active' : ''} onClick={() => navigate({ type: 'home' })}>题库</button>
        <button className={route.type === 'wrong' ? 'active' : ''} onClick={() => navigate({ type: 'wrong' })}>错题{totalWrong > 0 && <span>{totalWrong}</span>}</button>
      </nav>
      <div className="header-right">
        {!window.recallmate && <span className="preview-badge">浏览器预览</span>}
        <FontControls settings={preferences.settings} ready={preferences.ready} change={preferences.change} reset={preferences.reset} error={preferences.error} />
        <button className="header-tool help-tool" aria-label="使用指南" title="使用指南" onClick={() => setInfo('help')}><HelpCircle size={18} /></button>
        <button className="header-tool" onClick={() => setInfo('settings')}><Settings2 size={17} />设置</button>
      </div>
    </header>
    <main className={route.type === 'practice' ? 'main-content practice-main' : 'main-content'}>
      {(warnings.length > 0 || preferences.warning) && <div className="warning-banner" role="alert">{warnings.map((w, i) => <p key={i}>{w}</p>)}{preferences.warning && <p>{preferences.warning}</p>}<button className="text-button" onClick={() => setInfo('settings')}>查看数据目录</button></div>}
      {!loaded ? <div className="empty-state">正在读取题库…</div> : route.type === 'home' ? <>
        <div className="home-toolbar">
          <div className="toolbar-start"><div className="search-box"><Search size={18} /><input aria-label="搜索题库" placeholder="搜索题库" value={search} onChange={e => setSearch(e.target.value)} /></div><span className="collection-count">{bundles.length} 个题库 · {totalQuestions} 道题</span></div>
          <button className="primary" onClick={() => setImportText('')}><Plus size={17} />导入题库</button>
        </div>
        {bundles.length ? <div className="bank-table-container"><table className="bank-table data-table"><colgroup><col /><col className="bank-count-column" /><col className="bank-count-column" /><col className="bank-date-column last-practiced" /><col className="bank-actions-column" /></colgroup><thead><tr><th>题库名称</th><th className="numeric">题目</th><th className="numeric">错题</th><th className="last-practiced">最近练习</th><th className="actions-heading">操作</th></tr></thead>
          <tbody>{bundles.filter(b => b.bank.name.toLowerCase().includes(search.toLowerCase())).map(bankRow)}</tbody>
        </table>{search && !bundles.some(b => b.bank.name.toLowerCase().includes(search.toLowerCase())) && <div className="empty-state">没有找到匹配的题库</div>}</div> : <section className="first-bank empty-state"><BookOpen size={32} /><h2>暂无题库</h2><p>导入自己的题库，或先体验示例题。</p><div className="button-row"><button className="secondary" onClick={() => setImportText(sampleText)}>体验示例题库</button><button className="text-button" onClick={() => void choose()}>从文件导入</button></div></section>}
      </> : route.type === 'practice' && current?.session ? <PracticePage bundle={current} fontSize={preferences.settings.practiceFontSize} dispatch={(action, debounce) => { const b = data.current.find(x => x.bank.id === current.bank.id)!; update(practiceAction(b, action), debounce); }} exit={() => detail(current.bank.id)} restart={(mode, ids) => start(current.bank.id, mode, ids, true)} /> : route.type === 'detail' && current ? (() => {
        const questions = (detailTab === 'wrong' ? sortWrongQuestions(current.bank, recentSort) : current.bank.questions).filter(q => q.sourceText.toLowerCase().includes(search.toLowerCase()));
        const currentPage = Math.min(page, Math.max(1, Math.ceil(questions.length / 10)));
        return <>
          <div className="detail-heading">
            <div className="detail-title"><button className="icon-button" aria-label="返回题库" onClick={() => navigate({ type: 'home' })}><ArrowLeft size={23} /></button><h1>{current.bank.name}</h1><span className="collection-count">{current.bank.questions.length} 道题 · {wrongCount(current)} 道错题</span></div>
            <div className="button-row"><button className="secondary" onClick={() => void exportBank(current)}>导出备份</button><button className="primary" disabled={!current.bank.questions.length} onClick={() => { if (current.session && !current.session.isFinished) navigate({ type: 'practice', id: current.bank.id }); else start(current.bank.id); }}>{current.session && !current.session.isFinished ? '继续练习' : '开始练习'}</button>
              <details className="action-menu"><summary aria-label="选择练习模式"><ChevronDown size={17} /></summary><div><button disabled={!current.bank.questions.length} onClick={() => start(current.bank.id, 'all')}>新建顺序练习</button><button disabled={!current.bank.questions.length} onClick={() => start(current.bank.id, 'random')}>随机练习</button><button onClick={() => setRename({ id: current.bank.id, name: current.bank.name })}>重命名题库</button></div></details>
            </div>
          </div>
          <div className="detail-tools"><div className="tabs"><button className={detailTab === 'all' ? 'selected' : ''} onClick={() => { setDetailTab('all'); setSearch(''); setPage(1); }}>全部题目 <span>{current.bank.questions.length}</span></button><button className={detailTab === 'wrong' ? 'selected' : ''} onClick={() => { setDetailTab('wrong'); setSearch(''); setPage(1); }}>错题本 <span>{wrongCount(current)}</span></button></div></div>
          <div className="list-toolbar"><div className="search-box"><Search size={18} /><input aria-label="搜索题干或答案" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="搜索题干或答案" /></div>
            {detailTab === 'all' ? <button className="text-button" onClick={() => setEditor({ bankId: current.bank.id })}><Plus size={18} />新增题目</button> : <div className="button-row"><select className="sort-select" aria-label="错题排序" value={recentSort ? 'recent' : 'difficulty'} onChange={e => { setRecentSort(e.target.value === 'recent'); setPage(1); }}><option value="difficulty">按困难程度</option><option value="recent">按最近时间</option></select><button className="text-button" disabled={!wrongCount(current)} onClick={() => start(current.bank.id, 'wrong')}>重练全部错题</button></div>}
          </div>
          {questions.length ? <>{questionRows(current, questions.slice((currentPage - 1) * 10, currentPage * 10), detailTab === 'wrong')}{pagination(questions.length)}</> : <div className="empty-state"><h2>{search ? '没有匹配的题目' : detailTab === 'wrong' ? '暂无错题' : '暂无题目'}</h2><p>{search ? '试试其他关键词。' : detailTab === 'wrong' ? '答错或使用帮助的题目会自动加入错题本。' : '点击“新增题目”添加填空题。'}</p></div>}
        </>;
      })() : route.type === 'wrong' ? <>
        <div className="home-toolbar"><div className="toolbar-start"><div className="search-box"><Search size={18} /><input aria-label="搜索错题" placeholder="搜索错题" value={search} onChange={e => setSearch(e.target.value)} /></div><span className="collection-count">共 {totalWrong} 道错题</span></div></div>
        {totalWrong ? bundles.filter(b => wrongCount(b) > 0).map(b => { const questions = sortWrongQuestions(b.bank).filter(q => q.sourceText.toLowerCase().includes(search.toLowerCase())); return questions.length ? <section className="wrong-section" key={b.bank.id}><div className="section-heading"><h2>{b.bank.name} <span>{questions.length}</span></h2><button className="text-button" onClick={() => start(b.bank.id, 'wrong')}>复习本题库 <ArrowRight size={15} /></button></div>{questionRows(b, questions, true)}</section> : null; }) : <div className="empty-state"><CheckCircle2 size={32} /><h2>暂无错题</h2><p>答错或使用帮助的题目会自动加入这里。</p><button className="secondary" onClick={() => navigate({ type: 'home' })}>返回题库</button></div>}
        {totalWrong > 0 && !bundles.some(b => sortWrongQuestions(b.bank).some(q => q.sourceText.toLowerCase().includes(search.toLowerCase()))) && <div className="empty-state">没有匹配的错题</div>}
      </> : <div className="empty-state"><p>题库不存在或练习进度已清除。</p><button className="primary" onClick={() => navigate({ type: 'home' })}>返回题库</button></div>}
    </main>
    <footer className="app-footer"><span>v0.1.4</span><button className={`save-indicator ${combinedSave}`} onClick={() => { if (combinedSave === 'error') void run(async () => { if (preferences.status === 'error') preferences.retry(); await preferences.flush(); await flushPending(); await flushSaves(); }); }}>
      {combinedSave === 'saved' ? <CheckCircle2 size={15} /> : combinedSave === 'error' ? <HelpCircle size={15} /> : <Clock3 size={15} />}{combinedSave === 'saved' ? '已保存' : combinedSave === 'error' ? '重试保存' : '正在保存…'}
    </button></footer>
    {notice && <div className={`toast ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}>{notice.error ? <HelpCircle size={18} /> : <CheckCircle2 size={18} />}<span>{notice.message}</span><button aria-label="关闭消息" onClick={() => setNotice(null)}><X size={16} /></button></div>}
    {importText !== null && <ImportModal key={importText} initialText={importText} close={() => setImportText(null)} imported={importBundle} choose={choose} />}
    {editor && <EditorModal question={editor.question} close={() => setEditor(null)} save={saveQuestion} />}
    {rename && <Modal title="重命名题库" close={() => setRename(null)}><label className="field-label" htmlFor="rename-bank">题库名称</label><input id="rename-bank" className="text-input" value={rename.name} maxLength={120} onChange={e => setRename({ ...rename, name: e.target.value })} /><footer className="modal-footer"><span className="muted">题目与历史记录保留</span><button className="primary" disabled={!rename.name.trim()} onClick={() => { const b = data.current.find(x => x.bank.id === rename.id)!; update({ ...b, bank: { ...b.bank, name: rename.name.trim(), updatedAt: new Date().toISOString() } }); setRename(null); }}>保存名称</button></footer></Modal>}
    {info && <Modal title={info === 'help' ? '使用指南' : '设置'} close={() => setInfo(null)} wide>
      {info === 'help' ? <div className="guide-content"><h3>题库格式</h3><p>使用 UTF-8 的 TXT 或 Markdown，用双花括号标记答案，独占一行的 --- 分隔题目，| 分隔合法答案。</p><pre>{'# 生物学复习\n\n光合作用发生在{{叶绿体}}中。\n\n---\n\n水的化学式为{{H₂O|H2O}}。'}</pre><h3>练习操作</h3><p>Enter 判定当前空，全部正确后再按 Enter 切题。按住“答案”临时查看；“提示”补一个字符；“放弃”补全本题；“跳过”直接切题。</p><p>按 Enter 后，匹配的文字显示绿色，不匹配的文字显示红色，缺失内容不直接显示答案。顿号或“和”连接的并列内容支持换序，也支持混合连接；单个空内和多个空之间均可换序，每项只能使用一次。“和平”等词中的“和”保持原义，有歧义时请在连接词“和”两侧添加空格。其他大小写和符号仍严格匹配；未完全通过的提交仍计入本次错题，纯跳过不加入错题本。</p><button className="secondary" onClick={() => { setInfo(null); setImportText(sampleText); }}>导入示例题库</button></div> : <div className="settings-content">
        <section><h3>数据位置</h3><p className="data-path">{dataPath}</p><p className="muted">题库、进度、缓存和字号设置都保存在便携文件夹的 data 中。移动时请复制整个软件文件夹。</p><button className="secondary" disabled={!window.recallmate} onClick={() => void run(() => storage.openDataDirectory())}><FolderOpen size={16} />打开数据目录</button></section>
        <section><h3>备份与恢复</h3><p>在题库“更多”菜单或详情中导出 JSON，备份保存在 data/exports，包含题目、统计与当前进度。</p><button className="secondary" onClick={() => { setInfo(null); void choose(); }}><Upload size={16} />从 JSON 恢复</button></section>
        <section><h3>自动保存</h3><p>输入停止 400ms 后保存，判题与切题立即保存。每个题库保留上一份有效备份，损坏文件会保留。</p></section>
      </div>}
    </Modal>}
    {confirm && <Modal title={confirm.title} close={() => { if (!confirmBusy) setConfirm(null); }}><p className="confirm-message">{confirm.message}</p><footer className="modal-footer"><span /><div className="button-row"><button className="secondary" disabled={confirmBusy} onClick={() => setConfirm(null)}>取消</button><button className={confirm.danger ? 'danger' : 'primary'} disabled={confirmBusy} onClick={() => { setConfirmBusy(true); void run(async () => { await confirm.action(); setConfirm(null); }).finally(() => setConfirmBusy(false)); }}>{confirmBusy ? '正在处理…' : confirm.label ?? '确认'}</button></div></footer></Modal>}
  </div>;
}
