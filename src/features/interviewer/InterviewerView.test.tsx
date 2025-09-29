// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

afterEach(() => {
  cleanup();
});

describe("InterviewerView", () => {
  const baseSummary: InterviewSummary = {
    finalScore: 8.4,
    summaryText: "Solid performance",
    strengths: ["Strong communication"],
    improvements: ["Offer more context"]
  };

  interface ArchiveRecordOptions {
    profile?: Partial<CandidateProfile>;
    completedAt?: string;
  }

  const buildArchiveRecord = (
    id: string,
    summary: InterviewSummary,
    options: ArchiveRecordOptions = {}
  ): CandidateArchiveRecord => {
    const completedAt = options.completedAt ?? dayjs().subtract(1, "hour").toISOString();
    const profileOverrides = options.profile ?? {};
    const profile: CandidateProfile = {
      id,
      name: profileOverrides.name ?? "Jordan Candidate",
      email: profileOverrides.email ?? "jordan@example.com",
      phone: profileOverrides.phone ?? "555-0101",
      role: profileOverrides.role ?? "Product Manager",
      resume: profileOverrides.resume ?? null,
      missingFields: profileOverrides.missingFields ?? []
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

  it("filters candidates via the search control", async () => {
    const user = userEvent.setup();

    const summaryA: InterviewSummary = { ...baseSummary, finalScore: 8.1 };
    const summaryB: InterviewSummary = { ...baseSummary, finalScore: 7.3 };

    const recordA = buildArchiveRecord("alpha", summaryA, {
      profile: { name: "Alex Rivera" },
      completedAt: dayjs().subtract(2, "hour").toISOString()
    });
    const recordB = buildArchiveRecord("bravo", summaryB, {
      profile: { name: "Bianca Liu" },
      completedAt: dayjs().subtract(1, "hour").toISOString()
    });

    const sessionState: SessionState = {
      activeProfile: null,
      activeSession: null,
      resumeParse: {
        status: "idle",
        error: null
      },
      welcomeBackVisible: false
    };

    const candidatesState: CandidatesState = {
      records: {
        alpha: recordA,
        bravo: recordB
      },
      ids: ["bravo", "alpha"],
      sortKey: "score",
      sortDirection: "desc",
      searchQuery: ""
    };

    renderWithState(sessionState, candidatesState);

    expect(screen.getAllByTestId("candidate-entry")).toHaveLength(2);

    const searchInput = screen.getByPlaceholderText("Search by name...");
    await user.clear(searchInput);
    await user.type(searchInput, "bianca");

    const filteredEntries = await screen.findAllByTestId("candidate-entry");
    expect(filteredEntries).toHaveLength(1);
    expect(filteredEntries[0]).toHaveTextContent("Bianca Liu");

    await user.clear(searchInput);
    await waitFor(() => {
      expect(screen.getAllByTestId("candidate-entry")).toHaveLength(2);
    });
  });

  it("sorts candidates by score and order selections", async () => {
    const user = userEvent.setup();

    const summaryLow: InterviewSummary = { ...baseSummary, finalScore: 6.4 };
    const summaryMid: InterviewSummary = { ...baseSummary, finalScore: 7.9 };
    const summaryHigh: InterviewSummary = { ...baseSummary, finalScore: 9.2 };

    const now = dayjs();
    const recordLow = buildArchiveRecord("low", summaryLow, {
      profile: { name: "Low Score" },
      completedAt: now.subtract(3, "hour").toISOString()
    });
    const recordMid = buildArchiveRecord("mid", summaryMid, {
      profile: { name: "Mid Score" },
      completedAt: now.subtract(2, "hour").toISOString()
    });
    const recordHigh = buildArchiveRecord("high", summaryHigh, {
      profile: { name: "High Score" },
      completedAt: now.subtract(1, "hour").toISOString()
    });

    const sessionState: SessionState = {
      activeProfile: null,
      activeSession: null,
      resumeParse: {
        status: "idle",
        error: null
      },
      welcomeBackVisible: false
    };

    const candidatesState: CandidatesState = {
      records: {
        low: recordLow,
        mid: recordMid,
        high: recordHigh
      },
      ids: ["high", "mid", "low"],
      sortKey: "score",
      sortDirection: "desc",
      searchQuery: ""
    };

    renderWithState(sessionState, candidatesState);

    const sortBySelect = screen.getByLabelText("Sort candidates by");
    const sortOrderSelect = screen.getByLabelText("Sort order");

    await user.selectOptions(sortBySelect, "score");
    await user.selectOptions(sortOrderSelect, "asc");

    const entries = screen.getAllByTestId("candidate-entry");
    expect(entries[0]).toHaveTextContent("Low Score");
    expect(entries[entries.length - 1]).toHaveTextContent("High Score");
  });
});
