export type BlankStatus = 'unjudged' | 'correct' | 'partial' | 'incorrect';
export type CharSource = 'user' | 'hint' | 'give_up';
export interface BlankState { value: string; status: BlankStatus; charSources: CharSource[] }
export interface Question { id: string; sourceText: string; createdAt: string; updatedAt: string }
export interface QuestionStats {
  attemptCount: number; wrongAttemptCount: number; helpAttemptCount: number;
  independentCorrectCount: number; inWrongBook: boolean;
  lastAttemptAt?: string; lastDifficultyAt?: string; lastDifficultyType?: string;
}
export interface Bank {
  schemaVersion: 1; id: string; name: string; createdAt: string; updatedAt: string;
  questions: Question[]; stats: Record<string, QuestionStats>;
}
export interface Attempt {
  id: string; questionId: string; status: 'active' | 'completed' | 'abandoned' | 'skipped';
  strictBlankOrder?: boolean;
  blanks: BlankState[]; activeBlankIndex: number; hadWrongSubmission: boolean;
  usedHint: boolean; viewedAnswer: boolean; gaveUp: boolean;
  startedAt: string; endedAt?: string; difficultyAt?: string; difficultyType?: string;
  beforeStats: QuestionStats;
  wrongBookDismissed?: boolean;
}
export interface AttemptSummary {
  attemptId: string; questionId: string; independent: boolean; wrong: boolean;
  help: boolean; skipped: boolean;
}
export type PracticeMode = 'all' | 'random' | 'wrong' | 'single' | 'round-wrong';
export interface Session {
  schemaVersion: 1; bankId: string; sessionId: string; mode: PracticeMode;
  questionIds: string[]; currentIndex: number; currentAttempt?: Attempt;
  summaries: AttemptSummary[]; startedAt: string; updatedAt: string; isFinished: boolean;
}
export interface Bundle { schemaVersion: 1; bank: Bank; session?: Session }
