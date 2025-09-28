import { describe, expect, it } from "vitest";
import dayjs from "dayjs";

import sessionReducer, {
  beginResumeParse,
  clearActiveSession,
  setActiveProfile
} from "../store/slices/sessionSlice";
import candidatesReducer, { upsertCandidate } from "../store/slices/candidatesSlice";
import { findMissingFields } from "../services/resumeParser";
import type { CandidateArchiveRecord, CandidateProfile } from "../types/interview";

describe("module health smoke tests", () => {
  const buildProfile = (overrides: Partial<CandidateProfile> = {}): CandidateProfile => ({
    id: "profile-1",
    name: "Alex Doe",
    email: "alex@example.com",
    phone: "555-555-1234",
    role: "Full Stack Engineer",
    resume: null,
    missingFields: [],
    ...overrides
  });

  it("session reducer handles core lifecycle actions", () => {
    const initial = sessionReducer(undefined, { type: "@@INIT" });
    expect(initial.activeProfile).toBeNull();
    expect(initial.resumeParse.status).toBe("idle");

    const parsing = sessionReducer(initial, beginResumeParse());
    expect(parsing.resumeParse.status).toBe("parsing");

    const profile = buildProfile();
    const withProfile = sessionReducer(parsing, setActiveProfile(profile));
    expect(withProfile.activeProfile).toMatchObject({ id: "profile-1", name: "Alex Doe" });
    expect(withProfile.resumeParse.status).toBe("success");

    const cleared = sessionReducer(withProfile, clearActiveSession());
    expect(cleared.activeProfile).toBeNull();
    expect(cleared.activeSession).toBeNull();
    expect(cleared.resumeParse.status).toBe("idle");
  });

  it("candidate slice keeps highest scores first", () => {
    const baseProfile = buildProfile();
    const olderTimestamp = dayjs().subtract(2, "day").toISOString();
    const newerTimestamp = dayjs().toISOString();

    const makeRecord = (id: string, score: number, completedAt: string): CandidateArchiveRecord => ({
      id,
      profile: { ...baseProfile, id },
      sessionId: `session-${id}`,
      completedAt,
      finalScore: score,
      summary: {
        finalScore: score,
        summaryText: "Summary",
        strengths: ["Strength"],
        improvements: ["Improvement"]
      },
      questions: [],
      answers: [],
      chat: []
    });

    const first = makeRecord("one", 6.1, olderTimestamp);
    const second = makeRecord("two", 8.4, newerTimestamp);

    const stateAfterFirst = candidatesReducer(undefined, upsertCandidate(first));
    const stateAfterSecond = candidatesReducer(stateAfterFirst, upsertCandidate(second));

    expect(stateAfterSecond.ids).toEqual(["two", "one"]);
    expect(stateAfterSecond.records.two.finalScore).toBeCloseTo(8.4);
  });

  it("resume parser reports missing fields", () => {
    const missingProfile = buildProfile({ name: null, email: null, phone: "" });
    const missing = findMissingFields(missingProfile);
    expect(missing).toContain("name");
    expect(missing).toContain("email");
    expect(missing).toContain("phone");
  });
});
