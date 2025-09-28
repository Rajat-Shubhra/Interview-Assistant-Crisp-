import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import dayjs from "dayjs";
import { CandidateArchiveRecord } from "../../types/interview";

export type CandidateSortKey = "score" | "name" | "date";
export type CandidateSortDirection = "asc" | "desc";

export interface CandidatesState {
  records: Record<string, CandidateArchiveRecord>;
  ids: string[];
  sortKey: CandidateSortKey;
  sortDirection: CandidateSortDirection;
  searchQuery: string;
}

const initialState: CandidatesState = {
  records: {},
  ids: [],
  sortKey: "score",
  sortDirection: "desc",
  searchQuery: ""
};

const sorters: Record<CandidateSortKey, (a: CandidateArchiveRecord, b: CandidateArchiveRecord) => number> = {
  score: (a, b) => a.finalScore - b.finalScore,
  name: (a, b) => {
    const nameA = a.profile.name ?? "";
    const nameB = b.profile.name ?? "";
    return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
  },
  date: (a, b) => dayjs(a.completedAt).valueOf() - dayjs(b.completedAt).valueOf()
};

const applySort = (
  ids: string[],
  records: Record<string, CandidateArchiveRecord>,
  sortKey: CandidateSortKey,
  sortDirection: CandidateSortDirection
) => {
  const sorted = [...ids].sort((left, right) => {
    const a = records[left];
    const b = records[right];

    if (!a || !b) {
      return 0;
    }
    const base = sorters[sortKey](a, b);
    return sortDirection === "asc" ? base : base * -1;
  });
  return sorted;
};

const candidatesSlice = createSlice({
  name: "candidates",
  initialState,
  reducers: {
    upsertCandidate(state: CandidatesState, action: PayloadAction<CandidateArchiveRecord>) {
      const record = action.payload;
      state.records[record.id] = record;
      if (!state.ids.includes(record.id)) {
        state.ids.push(record.id);
      }
      state.ids = applySort(state.ids, state.records, state.sortKey, state.sortDirection);
    },
    removeCandidate(state: CandidatesState, action: PayloadAction<string>) {
      const id = action.payload;
      delete state.records[id];
      state.ids = state.ids.filter((existingId) => existingId !== id);
    },
    setSortKey(state: CandidatesState, action: PayloadAction<CandidateSortKey>) {
      state.sortKey = action.payload;
      state.ids = applySort(state.ids, state.records, state.sortKey, state.sortDirection);
    },
    setSortDirection(state: CandidatesState, action: PayloadAction<CandidateSortDirection>) {
      state.sortDirection = action.payload;
      state.ids = applySort(state.ids, state.records, state.sortKey, state.sortDirection);
    },
    setSearchQuery(state: CandidatesState, action: PayloadAction<string>) {
      state.searchQuery = action.payload;
    },
    hydrateCandidates(state: CandidatesState, action: PayloadAction<CandidatesState>) {
      state.records = action.payload.records;
      state.ids = action.payload.ids;
      state.sortKey = action.payload.sortKey;
      state.sortDirection = action.payload.sortDirection;
      state.searchQuery = action.payload.searchQuery;
    }
  }
});

export const {
  upsertCandidate,
  removeCandidate,
  setSortKey,
  setSortDirection,
  setSearchQuery,
  hydrateCandidates
} = candidatesSlice.actions;

export default candidatesSlice.reducer;
