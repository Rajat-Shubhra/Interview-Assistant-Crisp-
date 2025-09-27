export type QuestionDifficulty = "easy" | "medium" | "hard";

export type RequiredProfileField = "name" | "email" | "phone";

export interface ResumeFileMeta {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  storageKey: string;
}

export interface CandidateProfile {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  resume: ResumeFileMeta | null;
  missingFields: RequiredProfileField[];
}

export type ChatSender = "system" | "assistant" | "candidate";

export interface ChatMessage {
  id: string;
  sender: ChatSender;
  body: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface InterviewQuestion {
  id: string;
  prompt: string;
  difficulty: QuestionDifficulty;
  category: string;
  timeLimitSeconds: number;
  guidance?: string;
}

export interface AnswerRecord {
  questionId: string;
  answer: string;
  startedAt: string;
  submittedAt: string;
  elapsedSeconds: number;
  autoSubmitted: boolean;
  aiScore?: number;
  aiFeedback?: string;
}

export interface InterviewSummary {
  finalScore: number;
  summaryText: string;
  strengths: string[];
  improvements: string[];
}

export type SessionStage =
  | "resume-upload"
  | "profile-completion"
  | "ready-to-start"
  | "questioning"
  | "paused"
  | "completed";

export interface QuestionTimerState {
  questionId: string;
  remainingSeconds: number;
  isRunning: boolean;
  lastTickAt: string | null;
  startedAt: string | null;
}

export interface InterviewSession {
  id: string;
  candidateId: string;
  createdAt: string;
  updatedAt: string;
  stage: SessionStage;
  currentQuestionId: string | null;
  questions: Record<string, InterviewQuestion>;
  questionOrder: string[];
  answers: Record<string, AnswerRecord>;
  timers: Record<string, QuestionTimerState>;
  chat: ChatMessage[];
  summary: InterviewSummary | null;
}

export interface CandidateArchiveRecord {
  id: string;
  profile: CandidateProfile;
  sessionId: string;
  completedAt: string;
  finalScore: number;
  summary: InterviewSummary;
  questions: InterviewQuestion[];
  answers: AnswerRecord[];
  chat: ChatMessage[];
}

export interface InterviewConfiguration {
  totalQuestions: number;
  difficultyPattern: QuestionDifficulty[];
  timerByDifficulty: Record<QuestionDifficulty, number>;
}

export const DEFAULT_INTERVIEW_CONFIGURATION: InterviewConfiguration = {
  totalQuestions: 6,
  difficultyPattern: ["easy", "easy", "medium", "medium", "hard", "hard"],
  timerByDifficulty: {
    easy: 20,
    medium: 60,
    hard: 120
  }
};
