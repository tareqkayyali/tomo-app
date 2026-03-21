interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  retryableStatuses?: number[];
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 2,
    initialDelayMs = 1000,
    maxDelayMs = 5000,
    retryableStatuses = [429, 500, 502, 503, 529],
  } = options;

  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const status = err?.status || err?.statusCode;
      const isRetryable = retryableStatuses.includes(status) || err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT';

      if (attempt < maxRetries && isRetryable) {
        const delay = Math.min(initialDelayMs * Math.pow(2, attempt), maxDelayMs);
        console.warn(`[aiRetry] ${label} retry ${attempt + 1}/${maxRetries}`, { status, delay, error: err.message });
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      break;
    }
  }
  throw lastError;
}
