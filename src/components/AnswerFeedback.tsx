import type { KnowledgePoint, Question } from '../domain/types';

function ExplanationContent({ text, question }: { text: string; question: Question }) {
  const blocks=text.replace(/\r\n?/g,'\n').split(/^[ \t]*[-*+][ \t]+/m);
  if(blocks.length===1)return <p>{text}</p>;
  const options=question.type==='single_choice'||question.type==='multiple_choice'?question.options:[];
  return <>{blocks[0].trim()&&<p>{blocks[0].trim()}</p>}<ul className="option-explanations">{blocks.slice(1).map((block,index)=>{
    const lines=block.split('\n').map(line=>line.trim()).filter(Boolean);
    if(!lines.length)return null;
    const letter=lines[0].match(/^([A-Z])[：:.、)]\s*/)?.[1];
    const option=letter?options[letter.charCodeAt(0)-65]:undefined;
    return <li key={index}><strong className="option-explanation-title">{lines[0]}</strong>{option&&<p className="option-explanation-option">{option.text}</p>}{lines.slice(1).map((line,i)=>/^知识点\s/.test(line)?<blockquote className="option-explanation-evidence" key={i}>{line}</blockquote>:<p key={i}>{line}</p>)}</li>;
  })}</ul></>;
}
export function AnswerFeedback({ question, knowledgePoints }: { question: Question; knowledgePoints: KnowledgePoint[] }) {
  const points = new Map(knowledgePoints.map(point => [point.id, point]));
  if (!question.explanation && !question.knowledgeRefs?.length) return null;
  return <div className="answer-explanation">
    {question.explanation && <details className="feedback-panel question-rationale" key={`${question.id}-explanation`} aria-label="答案解析" open><summary>解析</summary><div className="feedback-panel-body"><ExplanationContent text={question.explanation} question={question}/></div></details>}
    {!!question.knowledgeRefs?.length && <details className="feedback-panel knowledge-panel" key={`${question.id}-knowledge`} open><summary>相关知识点 <span>（{question.knowledgeRefs.length}）</span></summary><div className="feedback-panel-body">{question.knowledgeRefs.map(id => {
      const point = points.get(id);
      if (!point) return <p className="inline-error" key={id}>知识点 {id} 不存在，请检查题库文件。</p>;
      const number=point.title?.match(/^知识点\s*(\d+)$/)?.[1]??point.locator?.match(/^第\s*(\d+)\s*条$/)?.[1]??point.id;
      const content=point.content
        .replace(/\{\{([^{}]+)\}\}/g, (_, value: string) => value.split('|')[0])
        .replace(/\r\n?/g,'\n')
        .replace(/\n(?:[ \t]*\n)+(?=[ \t]*(?:[（(](?:\d+|[一二三四五六七八九十百]+)[）)]|\d+[.．、)]|[-*+]\s))/g,'\n');
      return <section className="knowledge-point" key={id}><h3 title={point.title}>知识点 {number}{point.source && <span className="muted knowledge-source"> · 来源：{point.source}</span>}</h3><p>{content}</p></section>;
    })}</div></details>}
  </div>;
}
