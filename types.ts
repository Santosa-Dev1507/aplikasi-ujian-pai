export enum QuestionType {
  PG = 'PILIHAN_GANDA',
  PG_KOMPLEKS = 'PILIHAN_GANDA_KOMPLEKS',
  JODOHKAN = 'MENJODOHKAN',
  URAIAN = 'URAIAN',
}

export interface BaseQuestion {
  id: string;
  text: string;
  type: QuestionType;
  points: number;
}

export interface PGQuestion extends BaseQuestion {
  type: QuestionType.PG;
  options: { id: string; text: string }[];
  correctOptionId: string;
}

export interface PGKompleksQuestion extends BaseQuestion {
  type: QuestionType.PG_KOMPLEKS;
  options: { id: string; text: string }[];
  correctOptionIds: string[];
}

export interface JodohkanQuestion extends BaseQuestion {
  type: QuestionType.JODOHKAN;
  leftItems: { id: string; text: string }[];
  rightItems: { id: string; text: string }[];
  correctPairs: { leftId: string; rightId: string }[];
}

export interface UraianQuestion extends BaseQuestion {
  type: QuestionType.URAIAN;
  rubric: string; // For AI grading
}

export type Question = PGQuestion | PGKompleksQuestion | JodohkanQuestion | UraianQuestion;

export interface ExamState {
  status: 'idle' | 'active' | 'pending_finish' | 'pending_violation' | 'violation' | 'finished' | 'grading';
  currentQuestionIndex: number;
  answers: Record<string, any>; // questionId -> answer
  timeLeftSeconds: number;
  violationCount: number;
  score: number;
  aiFeedback: Record<string, { score: number; feedback: string }>;
}

export interface StudentData {
  name: string;
  class: string;
  nisn: string;
}
