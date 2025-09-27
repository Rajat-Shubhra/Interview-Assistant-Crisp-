import { nanoid } from "@reduxjs/toolkit";
import dayjs from "dayjs";
import type {
  AnswerRecord,
  CandidateProfile,
  ChatMessage,
  InterviewConfiguration,
  InterviewQuestion,
  InterviewSummary,
  QuestionDifficulty
} from "../types/interview";

interface OpenAIResponseChoice<T> {
  message?: {
    content?: string;
  };
}

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";

const FALLBACK_QUESTIONS: Record<QuestionDifficulty, string[]> = {
  easy: [
    "Explain the difference between let, const, and var in JavaScript.",
    "What does the Virtual DOM do in React?"
  ],
  medium: [
    "How would you design a REST API endpoint for updating user profiles?",
    "Describe how you would implement server-side rendering in a React + Node.js stack."
  ],
  hard: [
    "Walk through scaling a Node.js app to handle 100k concurrent users.",
    "Design a deployment pipeline for a monorepo with front-end and back-end services."
  ]
};

const readEnvKey = () => import.meta.env.VITE_OPENAI_API_KEY;

const buildHeaders = () => {
  const apiKey = readEnvKey();
  if (!apiKey) {
    return undefined;
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`
  } satisfies HeadersInit;
};

const callOpenAI = async <T>(body: unknown): Promise<T | null> => {
  const headers = buildHeaders();
  if (!headers) {
    return null;
  }

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error", errorText);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("OpenAI request failed", error);
    return null;
  }
};

const parseJsonFromChoice = (choice: OpenAIResponseChoice<unknown> | undefined) => {
  if (!choice?.message?.content) {
    return null;
  }
  const raw = choice.message.content.trim();
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end >= start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    return JSON.parse(raw);
  } catch (error) {
    console.warn("Failed to parse JSON from OpenAI response", error, raw);
    return null;
  }
};

const fallbackQuestions = (config: InterviewConfiguration): InterviewQuestion[] => {
  return config.difficultyPattern.map((difficulty, index) => {
    const bank = FALLBACK_QUESTIONS[difficulty];
    const prompt = bank[index % bank.length];
    return {
      id: nanoid(),
      prompt,
      difficulty,
      category: difficulty === "easy" ? "fundamentals" : difficulty === "medium" ? "architecture" : "scaling",
      timeLimitSeconds: config.timerByDifficulty[difficulty],
      guidance: "Provide a concise, concrete answer with relevant examples."
    } satisfies InterviewQuestion;
  });
};

export const generateInterviewQuestions = async (
  profile: CandidateProfile,
  config: InterviewConfiguration
): Promise<InterviewQuestion[]> => {
  const result = await callOpenAI<{ choices: OpenAIResponseChoice<unknown>[] }>(
    {
      model: DEFAULT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are an AI technical interviewer building a 6-question interview for a full-stack (React/Node.js) candidate. Respond with JSON matching the schema { questions: [{ id, prompt, difficulty, category, timeLimitSeconds, guidance }] }. Use the provided difficulty pattern."
        },
        {
          role: "user",
          content: JSON.stringify({
            candidate: {
              name: profile.name,
              email: profile.email,
              phone: profile.phone,
              role: profile.role
            },
            difficultyPattern: config.difficultyPattern,
            timerByDifficulty: config.timerByDifficulty
          })
        }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" }
    }
  );

  if (!result?.choices?.length) {
    return fallbackQuestions(config);
  }

  const parsed = parseJsonFromChoice(result.choices[0]);
  if (!parsed || !Array.isArray((parsed as { questions?: unknown }).questions)) {
    return fallbackQuestions(config);
  }

  const questions = (parsed as { questions: Array<Record<string, unknown>> }).questions;
  return questions.map((question) => {
    const difficulty = (question.difficulty as QuestionDifficulty) ?? "easy";
    return {
      id: (question.id as string) ?? nanoid(),
      prompt: (question.prompt as string) ?? "Describe a recent project you worked on.",
      difficulty,
      category: (question.category as string) ?? "general",
      timeLimitSeconds: Number(question.timeLimitSeconds ?? config.timerByDifficulty[difficulty]),
      guidance: (question.guidance as string) ?? "Share concrete details and trade-offs you considered."
    } satisfies InterviewQuestion;
  });
};

const fallbackScore = (answer: string, difficulty: QuestionDifficulty) => {
  if (!answer.trim()) {
    return 1;
  }
  const lengthFactor = Math.min(1, answer.length / 400);
  const keywordBoost = ["react", "node", "api", "architecture", "performance"].reduce(
    (score, keyword) => (answer.toLowerCase().includes(keyword) ? score + 1 : score),
    0
  );
  const base = difficulty === "hard" ? 6 : difficulty === "medium" ? 5 : 4;
  return Math.min(10, base + keywordBoost + lengthFactor * 3);
};

export const evaluateAnswerWithAI = async (
  question: InterviewQuestion,
  answer: string,
  chatHistory: ChatMessage[]
): Promise<{ score: number; feedback: string }> => {
  const result = await callOpenAI<{ choices: OpenAIResponseChoice<unknown>[] }>(
    {
      model: DEFAULT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are an AI interviewer evaluating a candidate's answer. Reply in JSON with { score: number (0-10), feedback: string }. Consider technical depth, clarity, and problem solving."
        },
        {
          role: "user",
          content: JSON.stringify({ question, answer, chatHistory })
        }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }
    }
  );

  if (!result?.choices?.length) {
    return {
      score: fallbackScore(answer, question.difficulty),
      feedback: "Using offline evaluator: good effort. Make sure to ground your answer with concrete examples and cover both implementation details and trade-offs."
    };
  }

  const parsed = parseJsonFromChoice(result.choices[0]);
  if (!parsed) {
    return {
      score: fallbackScore(answer, question.difficulty),
      feedback: "Unable to parse AI evaluation. Using heuristic score."
    };
  }

  const score = Number((parsed as { score?: number }).score ?? fallbackScore(answer, question.difficulty));
  const feedback = (parsed as { feedback?: string }).feedback ?? "Thanks for your answer.";
  return {
    score: Number.isFinite(score) ? score : fallbackScore(answer, question.difficulty),
    feedback
  };
};

export const summarizeInterviewWithAI = async (
  profile: CandidateProfile,
  questions: InterviewQuestion[],
  answers: AnswerRecord[]
): Promise<InterviewSummary> => {
  const result = await callOpenAI<{ choices: OpenAIResponseChoice<unknown>[] }>(
    {
      model: DEFAULT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are an AI interviewer summarizing a technical interview. Respond with JSON { finalScore: number (0-10), summaryText: string, strengths: string[], improvements: string[] }."
        },
        {
          role: "user",
          content: JSON.stringify({ profile, questions, answers })
        }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    }
  );

  const totalScore = answers.reduce((total, record) => total + (record.aiScore ?? 5), 0);
  const averageScore = answers.length > 0 ? totalScore / answers.length : 5;

  const baseSummary: InterviewSummary = {
    finalScore: Math.min(10, Math.max(0, averageScore)),
    summaryText:
      "Solid performance overall. Strengthen your depth in system design and clarify trade-off reasoning when possible.",
    strengths: ["Good communication", "Solid practical experience"],
    improvements: ["Provide more metrics", "Discuss alternative approaches"]
  };

  if (!result?.choices?.length) {
    return baseSummary;
  }

  const parsed = parseJsonFromChoice(result.choices[0]);
  if (!parsed) {
    return baseSummary;
  }

  const summary = parsed as InterviewSummary;
  return {
    finalScore: summary.finalScore ?? baseSummary.finalScore,
    summaryText: summary.summaryText ?? baseSummary.summaryText,
    strengths: summary.strengths?.length ? summary.strengths : baseSummary.strengths,
    improvements: summary.improvements?.length ? summary.improvements : baseSummary.improvements
  } satisfies InterviewSummary;
};