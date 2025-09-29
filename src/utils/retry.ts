export interface FetchRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  jitterMs?: number;
  retryStatuses?: number[];
  onRetry?: (info: RetryAttemptInfo) => void | Promise<void>;
}

export interface RetryAttemptInfo {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  reason: "status" | "error";
  status?: number;
  response?: Response;
  error?: unknown;
}

const DEFAULT_RETRY_STATUSES = [429, 500, 502, 503, 504];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const computeBackoffDelay = (baseDelayMs: number, jitterMs: number, attempt: number) => {
  const backoff = baseDelayMs * 2 ** (attempt - 1);
  const jitter = jitterMs > 0 ? Math.floor(Math.random() * (jitterMs + 1)) : 0;
  return backoff + jitter;
};

/**
 * Wrapper around fetch that retries transient failures using exponential backoff plus jitter.
 * Other services can reuse this helper to avoid duplicating retry logic for HTTP calls.
 */
export const fetchWithRetry = async (
  url: string,
  init: RequestInit,
  options: FetchRetryOptions = {}
): Promise<Response> => {
  const maxAttempts = options.maxAttempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const jitterMs = options.jitterMs ?? 200;
  const retryStatuses = new Set(options.retryStatuses ?? DEFAULT_RETRY_STATUSES);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, init);

      if (!response.ok && retryStatuses.has(response.status) && attempt < maxAttempts) {
        const delayMs = computeBackoffDelay(baseDelayMs, jitterMs, attempt);
        if (options.onRetry) {
          await options.onRetry({
            attempt,
            maxAttempts,
            delayMs,
            reason: "status",
            status: response.status,
            response: response.clone()
          });
        }
        await sleep(delayMs);
        continue;
      }

      return response;
    } catch (error) {
      if (attempt < maxAttempts) {
        const delayMs = computeBackoffDelay(baseDelayMs, jitterMs, attempt);
        if (options.onRetry) {
          await options.onRetry({
            attempt,
            maxAttempts,
            delayMs,
            reason: "error",
            error
          });
        }
        await sleep(delayMs);
        continue;
      }
      throw error;
    }
  }

  throw new Error("fetchWithRetry exhausted without returning a response");
};
