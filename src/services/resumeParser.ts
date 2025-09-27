import { GlobalWorkerOptions, getDocument } from "pdfjs-dist/legacy/build/pdf";
import mammoth from "mammoth";
import { nanoid } from "@reduxjs/toolkit";
import dayjs from "dayjs";
import type {
  CandidateProfile,
  RequiredProfileField,
  ResumeFileMeta
} from "../types/interview";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.js?url";

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_REGEX = /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/g;

interface ExtractedFields {
  name: string | null;
  email: string | null;
  phone: string | null;
  missingFields: RequiredProfileField[];
  rawText: string;
  highlightedPreview: string;
}

export interface ParsedResumeResult {
  profile: CandidateProfile;
  resumeMeta: ResumeFileMeta;
  rawText: string;
}

const ensurePdfWorker = () => {
  if (!GlobalWorkerOptions.workerSrc) {
    GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
  }
};

const extractFromText = (text: string): ExtractedFields => {
  const emailMatch = text.match(EMAIL_REGEX);
  const phoneMatch = text.match(PHONE_REGEX);

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const probableName = lines.length > 0 ? lines[0] : null;

  const missingFields: RequiredProfileField[] = [];
  if (!probableName) missingFields.push("name");
  if (!emailMatch?.[0]) missingFields.push("email");
  if (!phoneMatch?.[0]) missingFields.push("phone");

  const highlight = (value: string | null) => {
    if (!value) return value;
    return value.replace(/([.*+?^${}()|[\]\\])/g, "\\$1");
  };

  const emailPattern = highlight(emailMatch?.[0] ?? null);
  const phonePattern = highlight(phoneMatch?.[0] ?? null);
  const namePattern = highlight(probableName);

  let highlightedPreview = text;
  if (emailPattern) {
    highlightedPreview = highlightedPreview.replace(
      new RegExp(emailPattern, "g"),
      (match) => `<<${match}>>`
    );
  }
  if (phonePattern) {
    highlightedPreview = highlightedPreview.replace(
      new RegExp(phonePattern, "g"),
      (match) => `<<${match}>>`
    );
  }
  if (namePattern) {
    highlightedPreview = highlightedPreview.replace(namePattern, (match) => `<<${match}>>`);
  }

  return {
    name: probableName,
    email: emailMatch?.[0] ?? null,
    phone: phoneMatch?.[0] ?? null,
    missingFields,
    rawText: text,
    highlightedPreview
  };
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
  const isDocx = extension === "docx" || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  if (!isPdf && !isDocx) {
    throw new Error("Unsupported file type. Please upload a PDF or DOCX resume.");
  }

  const rawText = isPdf ? await extractPdfText(file) : await extractDocxText(file);
  if (!rawText.trim()) {
    throw new Error("Unable to extract text from the resume. Please try a different file.");
  }

  const extracted = extractFromText(rawText);

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
    name: extracted.name,
    email: extracted.email,
    phone: extracted.phone,
    role: options?.role ?? "Full Stack Engineer",
    resume: resumeMeta,
    missingFields: extracted.missingFields
  };

  return {
    profile,
    resumeMeta,
    rawText: extracted.rawText
  };
};

export const findMissingFields = (profile: CandidateProfile): RequiredProfileField[] => {
  const missing: RequiredProfileField[] = [];
  ("name" in profile && !profile.name) && missing.push("name");
  (!profile.email || profile.email.trim().length === 0) && missing.push("email");
  (!profile.phone || profile.phone.trim().length === 0) && missing.push("phone");
  return missing;
};
