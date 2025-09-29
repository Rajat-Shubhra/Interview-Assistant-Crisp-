import { createAsyncThunk, nanoid } from "@reduxjs/toolkit";
import dayjs from "dayjs";
import { message } from "antd";
import {
  addChatMessage,
  beginResumeParse,
  clearActiveSession,
  initializeSession,
  recordAnswer,
  resumeParseFailed,
  setActiveProfile,
  setCurrentQuestion,
  setInterviewSummary,
  setProfileMissingFields,
  setSessionStage,
  updateTimerState,
  upsertQuestions
} from "../slices/sessionSlice";
import { parseResumeFile, findMissingFields } from "../../services/resumeParser";
import {
  buildResumeStorageKey,
  persistResumeFile,
  deleteResumeFile
} from "../../services/resumeStorage";
import type { AppDispatch, RootState } from "../index";
import type {
  AnswerRecord,
  CandidateProfile,
  InterviewQuestion,
  InterviewSession,
  InterviewSummary,
  RequiredProfileField,
  SessionStage
} from "../../types/interview";
import { DEFAULT_INTERVIEW_CONFIGURATION } from "../../types/interview";
import {
  evaluateAnswerWithAI,
  generateInterviewQuestions,
  summarizeInterviewWithAI
} from "../../services/aiInterviewService";
import { upsertCandidate } from "../slices/candidatesSlice";

type AsyncThunkConfig = {
  state: RootState;
  dispatch: AppDispatch;
  rejectValue: string;
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const buildSessionScaffold = (
  profile: CandidateProfile,
  missingFields: RequiredProfileField[]
): InterviewSession => {
  const now = dayjs().toISOString();
  const stage: SessionStage = missingFields.length > 0 ? "profile-completion" : "ready-to-start";

  return {
    id: nanoid(),
    candidateId: profile.id,
    createdAt: now,
    updatedAt: now,
    stage,
    currentQuestionId: null,
    questions: {},
    questionOrder: [],
    answers: {},
    timers: {},
    chat: [],
    summary: null
  };
};

export const ingestResume = createAsyncThunk<void, { file: File }, AsyncThunkConfig>(
  "session/ingestResume",
  async ({ file }, { dispatch, rejectWithValue }) => {
    try {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        throw new Error("File is too large. Please upload a resume under 10 MB.");
      }

      dispatch(beginResumeParse());

      const parsed = await parseResumeFile(file, { role: "Full Stack Engineer" });

      const resumeId = parsed.resumeMeta.id;
      await persistResumeFile(resumeId, file);

      const missingFields = findMissingFields(parsed.profile);

      const profile: CandidateProfile = {
        ...parsed.profile,
        missingFields,
        resume: {
          ...parsed.resumeMeta,
          storageKey: buildResumeStorageKey(resumeId)
        }
      };

      const session = buildSessionScaffold(profile, missingFields);

      dispatch(setActiveProfile(profile));
      dispatch(initializeSession(session));
      dispatch(setProfileMissingFields(missingFields));
      dispatch(setSessionStage(session.stage));

      if (missingFields.length > 0) {
        message.info("Please confirm the missing details to continue the interview.");
      } else {
        message.success("Resume parsed successfully. You're ready to start!");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to parse resume.";
      dispatch(resumeParseFailed(errorMessage));
      message.error(errorMessage);
      return rejectWithValue(errorMessage);
    }

    return undefined;
  }
);

export const resetSession = createAsyncThunk<void, void, AsyncThunkConfig>(
  "session/reset",
  async (_, { dispatch, getState }) => {
    const state = getState();
    const resumeId = state.session.activeProfile?.resume?.id;
    if (resumeId) {
      const isResumeReferenced = Object.values(state.candidates.records).some((record) => {
        const candidateResumeId = record.profile.resume?.id;
        return candidateResumeId && candidateResumeId === resumeId;
      });

      if (!isResumeReferenced) {
        await deleteResumeFile(resumeId);
      }
    }
    dispatch(clearActiveSession());
  }
);

export const beginInterview = createAsyncThunk<void, void, AsyncThunkConfig>(
  "session/beginInterview",
  async (_, { dispatch, getState, rejectWithValue }) => {
    const state = getState();
    const profile = state.session.activeProfile;
    const session = state.session.activeSession;

    if (!profile || !session) {
      const error = "No active interview session. Please upload your resume again.";
      message.error(error);
      return rejectWithValue(error);
    }

    if (session.stage === "questioning" && session.currentQuestionId) {
      message.info("Your interview is already in progress.");
      return undefined;
    }

    if (session.stage === "completed") {
      message.info("This interview has already finished.");
      return undefined;
    }

    try {
      const questions = await generateInterviewQuestions(profile, DEFAULT_INTERVIEW_CONFIGURATION);

      if (!questions.length) {
        throw new Error("Couldn't generate interview questions. Please try again.");
      }

      dispatch(upsertQuestions({ questions }));

      const introTimestamp = dayjs().toISOString();
      dispatch(setSessionStage("questioning"));
      dispatch(
        addChatMessage({
          sender: "system",
          body: `Interview started for ${profile.name ?? "candidate"}. You'll have limited time for each question—answer as clearly and concisely as you can!`,
          createdAt: introTimestamp,
          metadata: { type: "start" }
        })
      );

      const firstQuestion = questions[0];
      if (!firstQuestion) {
        throw new Error("No questions available to begin the interview.");
      }

      const startTimestamp = dayjs().toISOString();
      dispatch(setCurrentQuestion(firstQuestion.id));
      dispatch(
        updateTimerState({
          questionId: firstQuestion.id,
          remainingSeconds: firstQuestion.timeLimitSeconds,
          isRunning: true,
          lastTickAt: startTimestamp,
          startedAt: startTimestamp
        })
      );
      dispatch(
        addChatMessage({
          sender: "assistant",
          body: `Question 1: ${firstQuestion.prompt}`,
          createdAt: startTimestamp,
          metadata: {
            questionId: firstQuestion.id,
            difficulty: firstQuestion.difficulty,
            type: "question",
            guidance: firstQuestion.guidance
          }
        })
      );
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : "Failed to start the interview. Please try again.";
      message.error(messageText);
      return rejectWithValue(messageText);
    }

    return undefined;
  }
);

export const submitAnswer = createAsyncThunk<
  void,
  { answer: string; autoSubmitted?: boolean },
  AsyncThunkConfig
>(
  "session/submitAnswer",
  async ({ answer, autoSubmitted = false }, { dispatch, getState, rejectWithValue }) => {
    const state = getState();
    const session = state.session.activeSession;
    const profile = state.session.activeProfile;

    if (!session || !profile) {
      const error = "No active interview session.";
      message.error(error);
      return rejectWithValue(error);
    }

    const questionId = session.currentQuestionId;
    if (!questionId) {
      const error = "There's no active question to submit.";
      message.warning(error);
      return rejectWithValue(error);
    }

    const question: InterviewQuestion | undefined = session.questions[questionId];
    if (!question) {
      const error = "Question details are missing. Please restart the interview.";
      message.error(error);
      return rejectWithValue(error);
    }

    const timer = session.timers[questionId];
    const submittedAt = dayjs().toISOString();
    const startedAt = timer?.startedAt ?? submittedAt;
    const trimmedAnswer = answer.trim();
    const elapsedFromTimer = timer
      ? question.timeLimitSeconds - Math.max(0, timer.remainingSeconds)
      : Math.max(0, dayjs(submittedAt).diff(dayjs(startedAt), "second"));
    const elapsedSeconds = Math.max(0, Math.min(question.timeLimitSeconds, Math.round(elapsedFromTimer)));
    const safeRemaining = Math.max(0, timer?.remainingSeconds ?? question.timeLimitSeconds - elapsedSeconds);

    dispatch(
      updateTimerState({
        questionId,
        remainingSeconds: safeRemaining,
        isRunning: false,
        lastTickAt: submittedAt,
        startedAt
      })
    );

    const chatBody =
      trimmedAnswer ||
      (autoSubmitted
        ? "(No response captured before the timer expired.)"
        : "(No response provided.)");

    dispatch(
      addChatMessage({
        sender: "candidate",
        body: chatBody,
        createdAt: submittedAt,
        metadata: { questionId, autoSubmitted, rawAnswer: trimmedAnswer }
      })
    );

    const updatedChat = getState().session.activeSession?.chat ?? [];

    let evaluationScore = 0;
    let evaluationFeedback = "";

    try {
      const evaluation = await evaluateAnswerWithAI(question, trimmedAnswer, updatedChat);
      evaluationScore = evaluation.score;
      evaluationFeedback = evaluation.feedback;
    } catch (error) {
      console.error("AI evaluation failed", error);
      evaluationScore = question.difficulty === "hard" ? 6 : question.difficulty === "medium" ? 5 : 4;
      evaluationFeedback = "We couldn't evaluate this answer with AI. Proceeding with a default score.";
    }

    const answerRecord: AnswerRecord = {
      questionId,
      answer: trimmedAnswer,
      startedAt,
      submittedAt,
      elapsedSeconds,
      autoSubmitted,
      aiScore: evaluationScore,
      aiFeedback: evaluationFeedback
    };

    dispatch(recordAnswer(answerRecord));
    dispatch(
      addChatMessage({
        sender: "assistant",
        body: `Score: ${evaluationScore}/10\n${evaluationFeedback}`,
        createdAt: dayjs().toISOString(),
        metadata: { questionId, type: "feedback", score: evaluationScore }
      })
    );

    const sessionAfterAnswer = getState().session.activeSession;
    if (!sessionAfterAnswer) {
      return undefined;
    }

    const order = sessionAfterAnswer.questionOrder;
    const currentIndex = order.indexOf(questionId);
    const hasNextQuestion = currentIndex >= 0 && currentIndex + 1 < order.length;

    if (hasNextQuestion) {
      const nextQuestionId = order[currentIndex + 1];
      const nextQuestion = sessionAfterAnswer.questions[nextQuestionId];
      if (nextQuestion) {
        const nextStart = dayjs().toISOString();
        dispatch(setCurrentQuestion(nextQuestionId));
        dispatch(
          updateTimerState({
            questionId: nextQuestionId,
            remainingSeconds: nextQuestion.timeLimitSeconds,
            isRunning: true,
            lastTickAt: nextStart,
            startedAt: nextStart
          })
        );
        dispatch(
          addChatMessage({
            sender: "assistant",
            body: `Question ${currentIndex + 2}: ${nextQuestion.prompt}`,
            createdAt: nextStart,
            metadata: {
              questionId: nextQuestionId,
              difficulty: nextQuestion.difficulty,
              type: "question",
              guidance: nextQuestion.guidance
            }
          })
        );
      }

      message.success("Answer submitted. Onto the next question!");
      return undefined;
    }

    dispatch(setCurrentQuestion(null));
    dispatch(setSessionStage("completed"));

    const summaryTargetSession = getState().session.activeSession;
    if (!summaryTargetSession) {
      return undefined;
    }

    const orderedQuestions: InterviewQuestion[] = summaryTargetSession.questionOrder
      .map((id) => summaryTargetSession.questions[id])
      .filter(Boolean);
    const orderedAnswers: AnswerRecord[] = summaryTargetSession.questionOrder
      .map((id) => summaryTargetSession.answers[id])
      .filter(Boolean);

    let summary: InterviewSummary;
    try {
      summary = await summarizeInterviewWithAI(profile, orderedQuestions, orderedAnswers);
    } catch (error) {
      console.error("Interview summary failed", error);
      summary = {
        finalScore: orderedAnswers.reduce((total, record) => total + (record.aiScore ?? 5), 0) /
          (orderedAnswers.length || 1),
        summaryText: "Summary unavailable due to an unexpected error.",
        strengths: ["Communicated clearly"],
        improvements: ["Provide more implementation details"]
      } satisfies InterviewSummary;
    }

    dispatch(setInterviewSummary(summary));

    const completionTime = dayjs().toISOString();
    dispatch(
      addChatMessage({
        sender: "assistant",
        body: `Thanks ${profile.name ?? "there"}! That's the end of the interview. Your overall score is ${summary.finalScore.toFixed(1)}/10.`,
        createdAt: completionTime,
        metadata: { type: "completion" }
      })
    );

    const finalSession = getState().session.activeSession;
    if (finalSession) {
      dispatch(
        upsertCandidate({
          id: profile.id,
          profile,
          sessionId: finalSession.id,
          completedAt: completionTime,
          finalScore: summary.finalScore,
          summary,
          questions: orderedQuestions,
          answers: orderedAnswers,
          chat: finalSession.chat
        })
      );
    }

    message.success("Interview completed! Review your summary in the interviewer tab.");
    return undefined;
  }
);
