export type BlankStatus = 'unjudged' | 'correct' | 'partial' | 'incorrect';
export type CharSource = 'user' | 'hint' | 'give_up';
export interface BlankState { value: string; status: BlankStatus; charSources: CharSource[] }
export const questionTypes = ['cloze', 'true_false', 'single_choice', 'multiple_choice'] as const;
export type QuestionType = typeof questionTypes[number];
export const questionTypeNames: Record<QuestionType, string> = { cloze: '填空', true_false: '判断', single_choice: '单选', multiple_choice: '多选' };
export interface KnowledgePoint { id: string; content: string; title?: string; source?: string; locator?: string }
export interface QuestionSource { kind: 'manual' | 'exam' | 'ai'; name?: string; locator?: string; batchId?: string }
export interface Option { id: string; text: string }
export interface QuestionBase { id: string; externalId: string; sourceText: string; createdAt: string; updatedAt: string; label?: string; knowledgeRefs?: string[]; explanation?: string; tags?: string[]; source?: QuestionSource }
export interface ClozeQuestion extends QuestionBase { type: 'cloze' }
export interface TrueFalseQuestion extends QuestionBase { type: 'true_false'; answer: boolean }
export interface SingleChoiceQuestion extends QuestionBase { type: 'single_choice'; options: Option[]; answer: string }
export interface MultipleChoiceQuestion extends QuestionBase { type: 'multiple_choice'; options: Option[]; answer: string[] }
export type ObjectiveQuestion = TrueFalseQuestion | SingleChoiceQuestion | MultipleChoiceQuestion;
export type Question = ClozeQuestion | ObjectiveQuestion;
export interface QuestionStats {
  attemptCount: number; wrongAttemptCount: number; helpAttemptCount: number;
  independentCorrectCount: number; inWrongBook: boolean;
  lastAttemptAt?: string; lastDifficultyAt?: string; lastDifficultyType?: string;
}
export interface Bank<Q extends Question = Question> {
  schemaVersion: 2; id: string; contentId: string; name: string; description?: string; createdAt: string; updatedAt: string;
  knowledgePoints: KnowledgePoint[]; questions: Q[]; stats: Record<string, QuestionStats>;
}
export interface AttemptBase {
  id: string; questionId: string;
  hadWrongSubmission: boolean; usedHint: boolean; viewedAnswer: boolean; gaveUp: boolean;
  startedAt: string; endedAt?: string; difficultyAt?: string; difficultyType?: string;
  beforeStats: QuestionStats; wrongBookDismissed?: boolean;
}
export interface ClozeAttempt extends AttemptBase {
  questionType: 'cloze'; status: 'active' | 'completed' | 'abandoned' | 'skipped';
  strictBlankOrder?: boolean;
  blanks: BlankState[]; activeBlankIndex: number;
}
export type ObjectiveAttempt = AttemptBase & { status: 'active' | 'submitted' | 'abandoned' | 'skipped' } & (
  { questionType: 'true_false'; selectedAnswer: boolean | null } |
  { questionType: 'single_choice'; selectedAnswer: string | null } |
  { questionType: 'multiple_choice'; selectedAnswer: string[] }
);
export type Attempt = ClozeAttempt | ObjectiveAttempt;
export interface AttemptSummary {
  attemptId: string; questionId: string; independent: boolean; wrong: boolean;
  help: boolean; skipped: boolean;
}
export type PracticeMode = 'all' | 'random' | 'wrong' | 'single' | 'round-wrong';
export interface Session<A extends Attempt = Attempt> {
  schemaVersion: 2; bankId: string; sessionId: string; mode: PracticeMode;
  questionIds: string[]; currentIndex: number; currentAttempt?: A;
  summaries: AttemptSummary[]; startedAt: string; updatedAt: string; isFinished: boolean;
}
export interface Bundle<Q extends Question = Question, A extends Attempt = Attempt> { format: 'recallmate.backup'; schemaVersion: 2; bank: Bank<Q>; session?: Session<A> }
export type ClozeBundle = Bundle<ClozeQuestion, ClozeAttempt>;
export interface ParsedQuestion { sourceText: string; fragments: string[]; answers: string[][] }
export interface ParseError { question: number; line: number; message: string }
export interface ImportPreview { name: string; questions: ParsedQuestion[]; blankCount: number; errors: ParseError[] }
export interface LoadResult { bundles: Bundle[]; warnings: string[] }
export interface DesktopAPI {
  loadSettings(): Promise<{ settings: import('./settings').AppSettings; warning?: string }>;
  saveSettings(settings: import('./settings').AppSettings): Promise<void>;
  load(): Promise<LoadResult>; save(bundle: Bundle): Promise<void>; remove(id: string): Promise<void>;
  chooseFile(): Promise<{ name: string; text: string } | null>;
  exportFile(bundle: Bundle): Promise<boolean>;
  exportContent(content: import('./questionBankPackage').QuestionBankPackage): Promise<boolean>;
  dataDirectory(): Promise<string>; openDataDirectory(): Promise<void>;
  onBeforeClose(callback: () => Promise<void>): () => void;
}
