import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "./index";
import type { CandidateArchiveRecord } from "../types/interview";
import type { CandidatesState } from "./slices/candidatesSlice";

export const selectSessionState = (state: RootState) => state.session;

export const selectActiveSession = (state: RootState) => state.session.activeSession;

export const selectActiveProfile = (state: RootState) => state.session.activeProfile;

export const selectResumeParseStatus = (state: RootState) => state.session.resumeParse;

export const selectWelcomeBackVisible = (state: RootState) => state.session.welcomeBackVisible;

export const selectCandidateState = (state: RootState) => state.candidates;

export const selectCandidateRecords = createSelector(
  [selectCandidateState],
  (candidatesState: CandidatesState) =>
    candidatesState.ids
      .map((id: string) => candidatesState.records[id])
      .filter(Boolean) as CandidateArchiveRecord[]
);

export const selectCandidateSearchQuery = (state: RootState) => state.candidates.searchQuery;

export const selectFilteredCandidates = createSelector(
  [selectCandidateRecords, selectCandidateSearchQuery],
  (records: CandidateArchiveRecord[], searchQuery: string) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return records;
    }

    return records.filter((record: CandidateArchiveRecord) => {
      const name = record.profile.name ?? "";
      const email = record.profile.email ?? "";
      const summaryText = record.summary.summaryText ?? "";
      return [name, email, summaryText].some((value) => value.toLowerCase().includes(query));
    });
  }
);

export const selectCandidateById = (id: string) =>
  createSelector([selectCandidateState], (state: CandidatesState) => state.records[id] ?? null);
