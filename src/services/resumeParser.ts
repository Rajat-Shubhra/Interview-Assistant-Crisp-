import { GlobalWorkerOptions, getDocument } from "pdfjs-dist/legacy/build/pdf";
import mammoth from "mammoth";
import { nanoid } from "@reduxjs/toolkit";
import dayjs from "dayjs";
import type {
  CandidateProfile,
  RequiredProfileField,
  ResumeFileMeta
} from "../types/interview";
import { callGemini, parseJsonFromText } from "./aiInterviewService";
import {
  isValidEmail,
  isValidPhone,
  sanitizeProfileFieldValue
} from "../utils/profileValidation";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.js?url";

export interface ParsedResumeResult {
  profile: CandidateProfile;
  resumeMeta: ResumeFileMeta;
  rawText: string;
}

export interface GeminiResumeContact {
  name: string | null;
  email: string | null;
  phone: string | null;
}

const EMPTY_CONTACT: GeminiResumeContact = {
  name: null,
  email: null,
  phone: null
};

const MAX_PROMPT_CHARACTERS = 6000;

const ensurePdfWorker = () => {
  if (!GlobalWorkerOptions.workerSrc) {
    GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
  }
};

const truncateForPrompt = (text: string, limit = MAX_PROMPT_CHARACTERS) => {
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}\n\n[Content truncated for prompt length]`;
};

const buildResumeParsingPrompt = (resumeText: string) => `You are an expert resume parser that extracts contact details from resumes of software engineers.
Return ONLY a JSON object with exactly these keys: "name", "email", and "phone".
- If a value is missing, return null for that key.
- Do not include any additional text, commentary, or markdown.
- Ensure the JSON is valid and parsable.

Resume text (between triple backticks):
\n\n\`\`\`
${truncateForPrompt(resumeText)}
\`\`\`
`;

const normalizeName = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const sanitized = sanitizeProfileFieldValue("name", value);
  const trimmed = sanitized.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const sanitized = sanitizeProfileFieldValue("email", value);
  return isValidEmail(sanitized) ? sanitized : null;
};

const normalizePhone = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const sanitized = sanitizeProfileFieldValue("phone", value);
  return isValidPhone(sanitized) ? sanitized : null;
};

const normalizeContactDetails = (payload: unknown): GeminiResumeContact => {
  if (!payload || typeof payload !== "object") {
    return EMPTY_CONTACT;
  }

  const candidate = payload as { name?: unknown; email?: unknown; phone?: unknown };
  return {
    name: normalizeName(candidate.name),
    email: normalizeEmail(candidate.email),
    phone: normalizePhone(candidate.phone)
  } satisfies GeminiResumeContact;
};

export const parseResumeTextWithGemini = async (rawText: string): Promise<GeminiResumeContact> => {
  try {
    const prompt = buildResumeParsingPrompt(rawText);
    const rawResponse = await callGemini(prompt, {
      temperature: 0.1,
      maxOutputTokens: 256
    });

    if (!rawResponse) {
      return EMPTY_CONTACT;
    }

    const parsed = parseJsonFromText(rawResponse);
    return normalizeContactDetails(parsed);
  } catch (error) {
    console.error("Gemini resume parsing failed", error);
    return EMPTY_CONTACT;
  }
};

const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      resolve(reader.result as ArrayBuffer);
    };
    reader.readAsArrayBuffer(file);
  });

const extractPdfText = async (file: File): Promise<string> => {
  ensurePdfWorker();
  const data = await readFileAsArrayBuffer(file);
  const pdf = await getDocument({ data }).promise;
  const maxPages = pdf.numPages;
  const pageTexts = await Promise.all(
    Array.from({ length: maxPages }, async (_, index) => {
      const page = await pdf.getPage(index + 1);
      const content = await page.getTextContent();
      type PdfTextItem = { str?: string } & Record<string, unknown>;
      return content.items
        .map((item: PdfTextItem) => (item.str ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    })
  );
  return pageTexts.join("\n");
};

const extractDocxText = async (file: File): Promise<string> => {
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const { value } = await mammoth.extractRawText({ arrayBuffer });
  return value;
};

const sanitizeMimeType = (mimeType: string) => {
  if (!mimeType) return "application/octet-stream";
  return mimeType;
};

export interface ResumeParsingOptions {
  role?: string;
}

export const parseResumeFile = async (
  file: File,
  options?: ResumeParsingOptions
): Promise<ParsedResumeResult> => {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension) {
    throw new Error("File must have an extension");
  }

  const isPdf = extension === "pdf" || file.type === "application/pdf";
  const isDocx =
    extension === "docx" ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  if (!isPdf && !isDocx) {
    throw new Error("Unsupported file type. Please upload a PDF or DOCX resume.");
  }

  const rawText = isPdf ? await extractPdfText(file) : await extractDocxText(file);
  if (!rawText.trim()) {
    throw new Error("Unable to extract text from the resume. Please try a different file.");
  }

  const contact = await parseResumeTextWithGemini(rawText);

  const resumeMeta: ResumeFileMeta = {
    id: nanoid(),
    fileName: file.name,
    mimeType: sanitizeMimeType(file.type),
    sizeBytes: file.size,
    uploadedAt: dayjs().toISOString(),
    storageKey: ""
  };

  const profile: CandidateProfile = {
    id: nanoid(),
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    role: options?.role ?? "Full Stack Engineer",
    resume: resumeMeta,
    missingFields: []
  };

  const missing = findMissingFields(profile);
  profile.missingFields = missing;

  return {
    profile,
    resumeMeta,
    rawText
  };
};

export const findMissingFields = (profile: CandidateProfile): RequiredProfileField[] => {
  const missing: RequiredProfileField[] = [];
  if (!profile.name || profile.name.trim().length === 0) {
    missing.push("name");
  }
  if (!profile.email || !isValidEmail(profile.email)) {
    missing.push("email");
  }
  if (!profile.phone || !isValidPhone(profile.phone)) {
    missing.push("phone");
  }
  return missing;
};
