// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { combineReducers, configureStore } from "@reduxjs/toolkit";
import dayjs from "dayjs";

import { InterviewerView } from "./InterviewerView";
import sessionReducer, { type SessionState } from "../../store/slices/sessionSlice";
import candidatesReducer, { type CandidatesState } from "../../store/slices/candidatesSlice";
import type {
  CandidateArchiveRecord,
  CandidateProfile,
  InterviewSession,
  InterviewSummary
} from "../../types/interview";

const ensureDomMocks = () => {
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false
      })
    });
  }

  if (!window.ResizeObserver) {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    Object.defineProperty(window, "ResizeObserver", {
      writable: true,
      value: ResizeObserverMock
    });
  }
};

ensureDomMocks();

describe("InterviewerView", () => {
  const baseSummary: InterviewSummary = {
    finalScore: 8.4,
    summaryText: "Solid performance",
    strengths: ["Strong communication"],
    improvements: ["Offer more context"]
  };

  const buildArchiveRecord = (id: string, summary: InterviewSummary): CandidateArchiveRecord => {
    const completedAt = dayjs().subtract(1, "hour").toISOString();
    const profile: CandidateProfile = {
      id,
      name: "Jordan Candidate",
      email: "jordan@example.com",
      phone: "555-0101",
      role: "Product Manager",
      resume: null,
      missingFields: []
    };

    return {
      id,
      profile,
      sessionId: `session-${id}`,
      completedAt,
      finalScore: summary.finalScore,
      summary,
      questions: [],
      answers: [],
      chat: []
    };
  };

  const renderWithState = (sessionState: SessionState, candidatesState: CandidatesState) => {
    const reducer = combineReducers({
      session: sessionReducer,
      candidates: candidatesReducer
    });

    const store = configureStore({
      reducer,
      preloadedState: {
        session: sessionState,
        candidates: candidatesState
      }
    });

    return render(
      <Provider store={store}>
        <InterviewerView />
      </Provider>
    );
  };

  it("deduplicates recent candidates when the active session is already archived", () => {
    const candidateId = "candidate-1";
    const summary = baseSummary;

    const archiveRecord = buildArchiveRecord(candidateId, summary);

    const activeSession: InterviewSession = {
      id: archiveRecord.sessionId,
      candidateId,
      createdAt: dayjs().subtract(90, "minutes").toISOString(),
      updatedAt: dayjs().toISOString(),
      stage: "completed",
      currentQuestionId: null,
      questions: {},
      questionOrder: [],
      answers: {},
      timers: {},
      chat: [],
      summary
    };

    const sessionState: SessionState = {
      activeProfile: archiveRecord.profile,
      activeSession,
      resumeParse: {
        status: "success",
        error: null
      },
      welcomeBackVisible: false
    };

    const candidatesState: CandidatesState = {
      records: {
        [candidateId]: archiveRecord
      },
      ids: [candidateId],
      sortKey: "score",
      sortDirection: "desc",
      searchQuery: ""
    };

    renderWithState(sessionState, candidatesState);

    const entries = screen.getAllByTestId("candidate-entry");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toHaveTextContent("Jordan Candidate");
  });
});
