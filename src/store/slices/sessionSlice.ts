import { createSlice, nanoid, PayloadAction } from "@reduxjs/toolkit";
import dayjs from "dayjs";
import {
  AnswerRecord,
  CandidateProfile,
  ChatMessage,
  InterviewQuestion,
  InterviewSession,
  InterviewSummary,
  QuestionDifficulty,
  QuestionTimerState,
  RequiredProfileField,
  SessionStage
} from "../../types/interview";

export type ResumeParseStatus = "idle" | "parsing" | "success" | "error";

interface ResumeParseState {
  status: ResumeParseStatus;
  error: string | null;
}

export interface SessionState {
  activeProfile: CandidateProfile | null;
  activeSession: InterviewSession | null;
  resumeParse: ResumeParseState;
  welcomeBackVisible: boolean;
}

const initialState: SessionState = {
  activeProfile: null,
  activeSession: null,
  resumeParse: {
    status: "idle",
    error: null
  },
  welcomeBackVisible: false
};

const touchSession = (session: InterviewSession) => {
  session.updatedAt = dayjs().toISOString();
};

const ensureQuestionTimer = (
  session: InterviewSession,
  questionId: string,
  fallbackDifficulty: QuestionDifficulty,
  fallbackDuration: number
) => {
  if (!session.timers[questionId]) {
    session.timers[questionId] = {
      questionId,
      remainingSeconds: fallbackDuration,
      isRunning: false,
      lastTickAt: null,
      startedAt: null
    } satisfies QuestionTimerState;
  }

  if (!session.questions[questionId]) {
    session.questions[questionId] = {
      id: questionId,
      prompt: "",
      difficulty: fallbackDifficulty,
      category: "",
      timeLimitSeconds: fallbackDuration
    } satisfies InterviewQuestion;
  }
};

const sessionSlice = createSlice({
  name: "session",
  initialState,
  reducers: {
  beginResumeParse(state: SessionState) {
      state.resumeParse = {
        status: "parsing",
        error: null
      };
    },
  resumeParseFailed(state: SessionState, action: PayloadAction<string>) {
      state.resumeParse = {
        status: "error",
        error: action.payload
      };
    },
    setActiveProfile(
      state: SessionState,
      action: PayloadAction<CandidateProfile>
    ) {
      state.activeProfile = action.payload;
      state.resumeParse.status = "success";
      state.resumeParse.error = null;
    },
    updateProfileField(
      state: SessionState,
      action: PayloadAction<{ field: RequiredProfileField; value: string }>
    ) {
      if (!state.activeProfile) {
        return;
      }

      const trimmedValue = action.payload.value.trim();
      const nextMissing = new Set(state.activeProfile.missingFields);
      if (trimmedValue.length === 0) {
        nextMissing.add(action.payload.field);
      } else {
        nextMissing.delete(action.payload.field);
      }

      state.activeProfile = {
        ...state.activeProfile,
        [action.payload.field]: trimmedValue,
        missingFields: Array.from(nextMissing)
      };
    },
    setProfileMissingFields(
      state: SessionState,
      action: PayloadAction<RequiredProfileField[]>
    ) {
      if (!state.activeProfile) {
        return;
      }
      state.activeProfile.missingFields = action.payload;
    },
    initializeSession(
      state: SessionState,
      action: PayloadAction<InterviewSession>
    ) {
      state.activeSession = action.payload;
      state.welcomeBackVisible = false;
    },
    upsertQuestions(
      state: SessionState,
      action: PayloadAction<{ questions: InterviewQuestion[] }>
    ) {
      if (!state.activeSession) {
        return;
      }
      const { questions } = action.payload;

  questions.forEach((question: InterviewQuestion) => {
        state.activeSession!.questions[question.id] = question;
        if (!state.activeSession!.questionOrder.includes(question.id)) {
          state.activeSession!.questionOrder.push(question.id);
        }
        ensureQuestionTimer(
          state.activeSession!,
          question.id,
          question.difficulty,
          question.timeLimitSeconds
        );
      });
      touchSession(state.activeSession);
    },
  setCurrentQuestion(state: SessionState, action: PayloadAction<string | null>) {
      if (!state.activeSession) {
        return;
      }
      state.activeSession.currentQuestionId = action.payload;
      if (action.payload) {
        ensureQuestionTimer(
          state.activeSession,
          action.payload,
          "easy",
          20
        );
      }
      touchSession(state.activeSession);
    },
  setSessionStage(state: SessionState, action: PayloadAction<SessionStage>) {
      if (!state.activeSession) {
        return;
      }
      state.activeSession.stage = action.payload;
      touchSession(state.activeSession);
    },
    addChatMessage(
      state: SessionState,
      action: PayloadAction<Omit<ChatMessage, "id"> & { id?: string }>
    ) {
      if (!state.activeSession) {
        return;
      }
      const message: ChatMessage = {
        id: action.payload.id ?? nanoid(),
        sender: action.payload.sender,
        body: action.payload.body,
        createdAt: action.payload.createdAt,
        metadata: action.payload.metadata
      };
      state.activeSession.chat.push(message);
      touchSession(state.activeSession);
    },
  recordAnswer(state: SessionState, action: PayloadAction<AnswerRecord>) {
      if (!state.activeSession) {
        return;
      }
      state.activeSession.answers[action.payload.questionId] = action.payload;
      touchSession(state.activeSession);
    },
    updateTimerState(
      state: SessionState,
      action: PayloadAction<QuestionTimerState>
    ) {
      if (!state.activeSession) {
        return;
      }
      state.activeSession.timers[action.payload.questionId] = action.payload;
      touchSession(state.activeSession);
    },
    setInterviewSummary(
      state: SessionState,
      action: PayloadAction<InterviewSummary>
    ) {
      if (!state.activeSession) {
        return;
      }
      state.activeSession.summary = action.payload;
      touchSession(state.activeSession);
    },
    setWelcomeBackVisible(
      state: SessionState,
      action: PayloadAction<boolean>
    ) {
      state.welcomeBackVisible = action.payload;
    },
  clearActiveSession(state: SessionState) {
      state.activeSession = null;
      state.activeProfile = null;
      state.resumeParse = {
        status: "idle",
        error: null
      };
      state.welcomeBackVisible = false;
    }
  }
});

export const {
  beginResumeParse,
  resumeParseFailed,
  setActiveProfile,
  updateProfileField,
  setProfileMissingFields,
  initializeSession,
  upsertQuestions,
  setCurrentQuestion,
  setSessionStage,
  addChatMessage,
  recordAnswer,
  updateTimerState,
  setInterviewSummary,
  setWelcomeBackVisible,
  clearActiveSession
} = sessionSlice.actions;

export default sessionSlice.reducer;
