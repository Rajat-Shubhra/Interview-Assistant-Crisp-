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

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_GEMINI_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash",
  "gemini-1.5-flash-001"
];

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

const readEnvKey = () => import.meta.env.VITE_GEMINI_API_KEY;
const readEnvModel = () => import.meta.env.VITE_GEMINI_MODEL?.trim();

interface GeminiCallOptions {
  temperature?: number;
  maxOutputTokens?: number;
}

export const callGemini = async (prompt: string, options?: GeminiCallOptions): Promise<string | null> => {
  const apiKey = readEnvKey();
  if (!apiKey) {
    return null;
  }

  const modelCandidates = Array.from(
    new Set(
      [readEnvModel(), ...DEFAULT_GEMINI_MODELS].filter((value): value is string => Boolean(value && value.length))
    )
  );

  if (!modelCandidates.length) {
    console.error("Gemini request aborted: no model candidates configured");
    return null;
  }

  for (const model of modelCandidates) {
    const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${apiKey}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: options?.temperature ?? 0.7,
            topP: 0.95,
            topK: 32,
            maxOutputTokens: options?.maxOutputTokens ?? 1024
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 404) {
          console.warn(`[Gemini] Model '${model}' unavailable, trying next candidate`, errorText);
          continue;
        }

        console.error("Gemini API error", { model, status: response.status, body: errorText });
        return null;
      }

      const data = await response.json();
      const raw = extractTextFromGemini(data);
      if (raw) {
        return raw;
      }

      console.warn(`[Gemini] Model '${model}' returned empty content`, data);
    } catch (error) {
      console.error(`Gemini request failed for model '${model}'`, error);
    }
  }

  console.error("Gemini request failed: all model candidates exhausted", modelCandidates);
  return null;
};

const extractTextFromGemini = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidates = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }>; }; }> }).candidates;
  if (!candidates?.length) {
    return null;
  }

  const parts = candidates[0]?.content?.parts;
  if (!parts?.length) {
    return null;
  }

  return parts
    .map((part) => (part?.text ?? ""))
    .join("")
    .trim();
};

export const parseJsonFromText = (raw: string | null): Record<string, unknown> | null => {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  try {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end >= start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    return JSON.parse(trimmed);
  } catch (error) {
    console.warn("Failed to parse JSON from Gemini response", error, raw);
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
  const prompt = `You are an AI technical interviewer creating a ${config.totalQuestions}-question assessment for a full-stack engineer focused on React and Node.js.
Return ONLY valid JSON that matches this schema:
{
  "questions": [
    {
      "id": string,
      "prompt": string,
      "difficulty": "easy" | "medium" | "hard",
      "category": string,
      "timeLimitSeconds": number,
      "guidance": string
    }
  ]
}

Interview configuration:
${JSON.stringify(config, null, 2)}

Guidelines:
- Ignore any candidate-specific resume or background details. Craft universally applicable questions.
- Each question should stand alone and be suitable for asking sequentially, one at a time.
- Cover a balanced mix of front-end (React), back-end (Node.js/Express), data handling, testing, and deployment/performance topics.
- Keep prompts concise but specific, and include targeted guidance for what a strong answer should cover.`;

  const raw = await callGemini(prompt, {
    temperature: 0.7,
    maxOutputTokens: 1024
  });

  const parsed = parseJsonFromText(raw);

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
  const prompt = `You are an AI interviewer evaluating a candidate's answer.
Return ONLY JSON with this schema:
{
  "score": number (0-10),
  "feedback": string
}

Rules:
- Respond with a single JSON object and absolutely no extra commentary, markdown, or explanations.
- The "feedback" value must be a concise summary under 100 words.
- Focus the feedback on the top 2-3 most critical issues or strengths that affect the score.

Consider technical depth, clarity, and problem solving.

Question:
${JSON.stringify(question, null, 2)}

Answer:
${answer}

Conversation history:
${JSON.stringify(chatHistory, null, 2)}`;

  const raw = await callGemini(prompt, {
    temperature: 0.2,
    maxOutputTokens: 512
  });

  if (!raw) {
    return {
      score: fallbackScore(answer, question.difficulty),
      feedback: "Using offline evaluator: good effort. Make sure to ground your answer with concrete examples and cover both implementation details and trade-offs."
    };
  }

  const parsed = parseJsonFromText(raw);
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
  const totalScore = answers.reduce((total, record) => total + (record.aiScore ?? 5), 0);
  const averageScore = answers.length > 0 ? totalScore / answers.length : 5;

  const baseSummary: InterviewSummary = {
    finalScore: Math.min(10, Math.max(0, averageScore)),
    summaryText:
      "Solid performance overall. Strengthen your depth in system design and clarify trade-off reasoning when possible.",
    strengths: ["Good communication", "Solid practical experience"],
    improvements: ["Provide more metrics", "Discuss alternative approaches"]
  };

  const prompt = `You are an AI interviewer summarizing a technical interview.
Return ONLY JSON with this schema:
{
  "finalScore": number (0-10),
  "summaryText": string,
  "strengths": string[],
  "improvements": string[]
}

Candidate profile:
${JSON.stringify(profile, null, 2)}

Questions:
${JSON.stringify(questions, null, 2)}

Answers:
${JSON.stringify(answers, null, 2)}`;

  const raw = await callGemini(prompt, {
    temperature: 0.3,
    maxOutputTokens: 1024
  });

  if (!raw) {
    return baseSummary;
  }

  const parsed = parseJsonFromText(raw);
  if (!parsed) {
    return baseSummary;
  }

  const summary = parsed as unknown as Partial<InterviewSummary>;
  return {
    finalScore: summary.finalScore ?? baseSummary.finalScore,
    summaryText: summary.summaryText ?? baseSummary.summaryText,
    strengths: summary.strengths?.length ? summary.strengths : baseSummary.strengths,
    improvements: summary.improvements?.length ? summary.improvements : baseSummary.improvements
  } satisfies InterviewSummary;
};