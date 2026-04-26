const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?){2,4}\d{2,4}\b/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const JWT_RE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?\b/g;
const SUPABASE_KEY_RE = /\b(?:sbp|sbx|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9)[A-Za-z0-9._-]*\b/g;

const SENSITIVE_KEYS = [
  "token",
  "key",
  "password",
  "dob",
  "birth",
  "phone",
  "email",
  "authorization",
  "cookie",
  "payload",
  "body",
  "message",
];

function scrubText(input: string): string {
  return input
    .replace(BEARER_RE, "Bearer [redacted]")
    .replace(JWT_RE, "[jwt-redacted]")
    .replace(SUPABASE_KEY_RE, "[key-redacted]")
    .replace(EMAIL_RE, "[email-redacted]")
    .replace(PHONE_RE, "[phone-redacted]");
}

export function redactMessage(msg: string): string {
  const scrubbed = scrubText(msg || "");
  if (scrubbed.length <= 120) return scrubbed;
  return `${scrubbed.slice(0, 100)}...[redacted]`;
}

export function redactStack(stack: string): string {
  if (!stack) return "";
  return scrubText(stack).replace(
    /\/[A-Za-z0-9/_-]*[0-9a-f]{8}-[0-9a-f-]{27,}[A-Za-z0-9/_-]*/gi,
    "/[path-redacted]"
  );
}

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.some((token) => lower.includes(token));
}

export function redactMetadata(meta: Record<string, unknown>): Record<string, unknown> {
  const walk = (value: unknown, keyHint = ""): unknown => {
    if (value == null) return value;

    if (typeof value === "string") {
      if (isSensitiveKey(keyHint)) return "[redacted]";
      return scrubText(value);
    }

    if (Array.isArray(value)) {
      return value.map((entry) => walk(entry, keyHint));
    }

    if (typeof value === "object") {
      const source = value as Record<string, unknown>;
      const output: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(source)) {
        if (isSensitiveKey(key)) {
          output[key] = "[redacted]";
          continue;
        }
        output[key] = walk(entry, key);
      }
      return output;
    }

    return value;
  };

  return walk(meta) as Record<string, unknown>;
}
