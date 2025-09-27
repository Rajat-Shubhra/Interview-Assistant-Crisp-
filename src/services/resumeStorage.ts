import { set, get, del } from "idb-keyval";

type StoredResumePayload = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: ArrayBuffer;
};

const RESUME_STORAGE_PREFIX = "resume:";

export const buildResumeStorageKey = (id: string) => `${RESUME_STORAGE_PREFIX}${id}`;

export const persistResumeFile = async (id: string, file: File): Promise<void> => {
  const buffer = await file.arrayBuffer();
  const payload: StoredResumePayload = {
    id,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    buffer
  };
  await set(buildResumeStorageKey(id), payload);
};

export const loadResumeFile = async (id: string): Promise<StoredResumePayload | undefined> => {
  return get<StoredResumePayload>(buildResumeStorageKey(id));
};

export const deleteResumeFile = async (id: string): Promise<void> => {
  await del(buildResumeStorageKey(id));
};
