import { parseQuestion } from './parser';
import { emptyStats } from './practice';
import { questionTypes, type Bundle, type KnowledgePoint, type Option, type Question, type QuestionSource, type QuestionType } from './types';

export const maximumFileBytes = 20 * 1024 * 1024;
export function assertData(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
export function isRecord(value: unknown): value is Record<string, any> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function externalId(value: unknown): value is string { return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value); }
export function text(value: unknown, label: string, max = 100000): asserts value is string { assertData(typeof value === 'string' && !!value.trim() && value.length <= max, `${label}需为非空文本，最多 ${max} 字符`); }
export function assertFileSize(value: string) { assertData(new TextEncoder().encode(value).byteLength <= maximumFileBytes, '题库文件超过 20 MiB，请分库导入'); }
type Metadata = Pick<Question, 'label' | 'knowledgeRefs' | 'explanation' | 'tags' | 'source'>;
export type ContentQuestion = Metadata & { id: string; stem: string; reviewStatus?: 'ready' | 'draft' | 'needs_review'; reviewNote?: string } & (
  { type: 'cloze' } | { type: 'true_false'; answer: boolean } | { type: 'single_choice'; options: Option[]; answer: string } | { type: 'multiple_choice'; options: Option[]; answer: string[] }
);
export interface QuestionBankPackage { format: 'recallmate.question-bank'; version: 1; bank: { id: string; name: string; description?: string }; knowledgePoints: KnowledgePoint[]; questions: ContentQuestion[] }
export interface ContentPreview { content: QuestionBankPackage; warnings: string[]; requiresReview: boolean }
function optionalText(value: unknown, label: string, max = 100000): string | undefined { if (value === undefined) return; text(value,label,max); return value; }
function stringList(value: unknown, label: string, limit: number, id = false): string[] | undefined {
  if (value === undefined) return;
  assertData(Array.isArray(value) && value.length <= limit && value.every(x => typeof x === 'string' && !!x.trim() && x.length <= 200 && (!id || externalId(x))) && new Set(value).size === value.length, `${label}格式无效或含重复项`);
  return [...value];
}
export function validateKnowledge(input: unknown, label = '知识点'): KnowledgePoint {
  assertData(isRecord(input) && externalId(input.id), `${label}.id 无效`); text(input.content,`${label}.content`);
  return { id: input.id, content: input.content, title: optionalText(input.title,`${label}.title`,200), source: optionalText(input.source,`${label}.source`,200), locator: optionalText(input.locator,`${label}.locator`,200) };
}
export function validateContentQuestion(input: unknown, label = '题目'): ContentQuestion {
  assertData(isRecord(input) && externalId(input.id), `${label}.id 无效`);
  assertData(questionTypes.includes(input.type), `${label}.type 题型无效`); text(input.stem,`${label}.stem`);
  let source: QuestionSource | undefined;
  if(input.source !== undefined) { assertData(isRecord(input.source) && ['manual','exam','ai'].includes(input.source.kind),`${label}.source 无效`); source={kind:input.source.kind,name:optionalText(input.source.name,`${label}.source.name`,200),locator:optionalText(input.source.locator,`${label}.source.locator`,200),batchId:optionalText(input.source.batchId,`${label}.source.batchId`,200)}; }
  if(input.reviewStatus !== undefined) assertData(['draft','ready','needs_review'].includes(input.reviewStatus),`${label}.reviewStatus 无效`);
  const base={id:input.id,stem:input.stem,label:optionalText(input.label,`${label}.label`,200),knowledgeRefs:stringList(input.knowledgeRefs,`${label}.knowledgeRefs`,10000,true),explanation:optionalText(input.explanation,`${label}.explanation`),tags:stringList(input.tags,`${label}.tags`,20),source,reviewStatus:input.reviewStatus,reviewNote:optionalText(input.reviewNote,`${label}.reviewNote`)};
  if(input.type==='cloze') { assertData(input.answer===undefined && input.options===undefined,`${label}填空题不能另设 answer/options`); parseQuestion(input.stem); return {...base,type:'cloze'}; }
  assertData(!/[{]{2}|[}]{2}/.test(input.stem),`${label}客观题不能包含填空标记`);
  if(input.type==='true_false') { assertData(typeof input.answer==='boolean' && input.options===undefined,`${label}.answer 必须为布尔值 true/false，不能使用字符串`); return {...base,type:'true_false',answer:input.answer}; }
  assertData(Array.isArray(input.options) && input.options.length>=2 && input.options.length<=26,`${label}.options 需有 2—26 个选项`);
  const ids=new Set<string>(), words=new Set<string>();
  const options: Option[]=input.options.map((o: unknown,i:number)=>{assertData(isRecord(o)&&externalId(o.id)&&!ids.has(o.id),`${label}.options[${i}].id 无效或重复`);text(o.text,`${label}.options[${i}].text`);assertData(!words.has(o.text.trim()),`${label}选项文字重复`);ids.add(o.id);words.add(o.text.trim());return{id:o.id,text:o.text};});
  if(input.type==='single_choice') { assertData(typeof input.answer==='string' && ids.has(input.answer),`${label}.answer 必须是一个有效选项 ID`);return {...base,type:'single_choice',options,answer:input.answer}; }
  assertData(Array.isArray(input.answer)&&input.answer.length>=2&&input.answer.length<=options.length&&input.answer.every((id:unknown)=>typeof id==='string'&&ids.has(id))&&new Set(input.answer).size===input.answer.length,`${label}.answer 需为至少两个不重复的有效选项 ID`);
  return {...base,type:'multiple_choice',options,answer:[...input.answer]};
}
export function previewQuestionBankPackage(input: unknown): ContentPreview {
  assertData(isRecord(input)&&input.format==='recallmate.question-bank'&&input.version===1,'不支持此内容包格式或版本');
  assertData(isRecord(input.bank)&&externalId(input.bank.id),'bank.id 无效');text(input.bank.name,'bank.name',120);
  assertData(Array.isArray(input.questions)&&input.questions.length>0&&input.questions.length<=10000,'questions 需有 1—10000 道题目');
  assertData(input.knowledgePoints===undefined||(Array.isArray(input.knowledgePoints)&&input.knowledgePoints.length<=10000),'knowledgePoints 格式无效');
  const knowledgePoints=(input.knowledgePoints??[]).map((k:unknown,i:number)=>validateKnowledge(k,`knowledgePoints[${i}]`)) as KnowledgePoint[];
  const pointIds=new Set(knowledgePoints.map(k=>k.id));assertData(pointIds.size===knowledgePoints.length,'知识点 ID 重复');
  const questions:ContentQuestion[]=[], ids=new Set<string>(), errors:string[]=[], warnings:string[]=[];
  const known=new Set(['id','type','stem','answer','options','label','knowledgeRefs','explanation','tags','source','reviewStatus','reviewNote']);
  input.questions.forEach((q:unknown,i:number)=>{try{const item=validateContentQuestion(q,`questions[${i}]`);assertData(!ids.has(item.id),`questions[${i}].id 重复`);ids.add(item.id);for(const ref of item.knowledgeRefs??[])assertData(pointIds.has(ref),`questions[${i}].knowledgeRefs：知识点 ${ref} 不存在`);questions.push(item);if(isRecord(q))for(const key of Object.keys(q))if(!known.has(key))warnings.push(`questions[${i}].${key} 未识别，确认导入后忽略`);}catch(error){errors.push((error as Error).message);}});
  assertData(!errors.length,errors.slice(0,100).join('\n')+(errors.length>100?`\n还有 ${errors.length-100} 项错误`:''));
  for(const key of Object.keys(input))if(!['format','version','bank','knowledgePoints','questions'].includes(key))warnings.push(`顶层 ${key} 未识别，确认导入后忽略`);
  for(const key of Object.keys(input.bank))if(!['id','name','description'].includes(key))warnings.push(`bank.${key} 未识别，确认导入后忽略`);
  (input.knowledgePoints??[]).forEach((k:any,i:number)=>{for(const key of Object.keys(k))if(!['id','content','title','source','locator'].includes(key))warnings.push(`knowledgePoints[${i}].${key} 未识别，确认导入后忽略`);});
  input.questions.forEach((q:any,i:number)=>{if(q.options)q.options.forEach((o:any,j:number)=>{for(const key of Object.keys(o))if(!['id','text'].includes(key))warnings.push(`questions[${i}].options[${j}].${key} 未识别，确认导入后忽略`);});if(q.source)for(const key of Object.keys(q.source))if(!['kind','name','locator','batchId'].includes(key))warnings.push(`questions[${i}].source.${key} 未识别，确认导入后忽略`);});
  const content:QuestionBankPackage={format:'recallmate.question-bank',version:1,bank:{id:input.bank.id,name:input.bank.name,description:optionalText(input.bank.description,'bank.description')},knowledgePoints,questions};
  assertFileSize(JSON.stringify(content));
  return {content,warnings,requiresReview:questions.some(q=>q.reviewStatus==='draft'||q.reviewStatus==='needs_review')};
}
export const validateQuestionBankPackage = (input: unknown): QuestionBankPackage => previewQuestionBankPackage(input).content;
export function contentQuestion(q: Question): ContentQuestion {
  const base={id:q.externalId,stem:q.sourceText,label:q.label,knowledgeRefs:q.knowledgeRefs,explanation:q.explanation,tags:q.tags,source:q.source};
  if(q.type==='cloze')return {...base,type:q.type};
  if(q.type==='true_false')return {...base,type:q.type,answer:q.answer};
  return {...base,type:q.type,options:q.options,answer:q.answer} as ContentQuestion;
}
export function exportQuestionBankContent(bundle: Bundle): QuestionBankPackage {
  return validateQuestionBankPackage({format:'recallmate.question-bank',version:1,bank:{id:bundle.bank.contentId,name:bundle.bank.name,description:bundle.bank.description},knowledgePoints:bundle.bank.knowledgePoints,questions:bundle.bank.questions.map(contentQuestion)});
}
function canonical(input: unknown): string {
  if(Array.isArray(input))return '['+input.map(canonical).join(',')+']';
  if(isRecord(input))return '{'+Object.keys(input).filter(k=>input[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(input[k])).join(',')+'}';
  return JSON.stringify(input);
}
function comparable(q: ContentQuestion) { const {reviewStatus:_,reviewNote:__,...rest}=q;return canonical({...rest,knowledgeRefs:q.knowledgeRefs??[],tags:q.tags??[],...(q.type==='multiple_choice'?{answer:[...q.answer].sort()}: {})}); }
export function importQuestionBankContent(input: QuestionBankPackage, target?: Bundle, name?: string): { bundle: Bundle; added: number; skipped: number } {
  const pkg=validateQuestionBankPackage(input), timestamp=new Date().toISOString();
  const bank=target?.bank??{schemaVersion:2 as const,id:crypto.randomUUID(),contentId:pkg.bank.id,name:name?.trim()||pkg.bank.name,description:pkg.bank.description,createdAt:timestamp,updatedAt:timestamp,questions:[],knowledgePoints:[],stats:{}};
  const points=new Map(bank.knowledgePoints.map(k=>[k.id,k])), existing=new Map(bank.questions.map(q=>[q.externalId,q]));
  for(const point of pkg.knowledgePoints){const old=points.get(point.id);assertData(!old||canonical(old)===canonical(point),`知识点 ${point.id} 内容冲突，请修改 ID 并同步引用，或另建题库`);if(!old)points.set(point.id,point);}
  assertData(points.size<=10000,'追加后知识点超过 10000 条，请分库');
  const additions:Question[]=[];let skipped=0;
  for(const q of pkg.questions){const old=existing.get(q.id);if(old){assertData(comparable(contentQuestion(old))===comparable(q),`题目 ${q.id} 内容冲突，未覆盖原题或学习记录`);skipped++;continue;}const {id,stem,reviewStatus:_,reviewNote:__,...fields}=q;additions.push({...fields,id:crypto.randomUUID(),externalId:id,sourceText:stem,createdAt:timestamp,updatedAt:timestamp} as Question);}
  if(target&&!additions.length)return {bundle:target,added:0,skipped};
  assertData(bank.questions.length+additions.length<=10000,'追加后超过 10000 题，请分库');
  const bundle:Bundle={...(target??{format:'recallmate.backup' as const,schemaVersion:2 as const}),bank:{...bank,updatedAt:timestamp,knowledgePoints:[...points.values()],questions:[...bank.questions,...additions],stats:{...bank.stats,...Object.fromEntries(additions.map(q=>[q.id,emptyStats()]))}}};
  assertFileSize(JSON.stringify(bundle));return {bundle,added:additions.length,skipped};
}
