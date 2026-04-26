# Telemetry Contract v1

Canonical event shape used by `mobile`, `backend`, and `python` error emitters.

## Required Fields

- `trace_id`: user-action correlation id spanning all services
- `request_id`: per-hop request id stamped by backend proxy
- `layer`: `mobile` | `backend` | `python`
- `error_code`: namespaced code (`ERR_<LAYER>_<DOMAIN>_<SPECIFIC>`)
- `error_type`: runtime exception class (`TypeError`, `AuthError`, etc.)
- `message`: redacted message string
- `fingerprint`: deterministic hash for grouping
- `severity`: `critical` | `high` | `medium` | `low` | `info`
- `sampled`: whether event participates in spike stats
- `environment`: runtime environment (`production`, `staging`, ...)
- `created_at`: event timestamp in UTC

## Optional Fields

- `user_id`, `session_id`
- `endpoint`, `http_status`
- `stack_trace` (redacted)
- `app_version`, `platform`, `os_version`
- `metadata` (deep-redacted JSON)

## Correlation Rules

1. Mobile generates `x-trace-id` per user action and sends it with API calls.
2. Backend proxy always stamps/propagates:
   - `x-trace-id` (reuse incoming or generate)
   - `x-request-id` (new per backend request hop)
3. Backend includes both ids on response headers.
4. Backend-to-python requests forward the same ids.
5. Error rows from all layers must include at least `trace_id` whenever available.

## Redaction Rules

- Remove bearer tokens, JWTs, API keys, emails, and phones from all strings.
- Redact sensitive metadata keys recursively:
  - `token`, `key`, `password`, `dob`, `birth`, `phone`, `email`,
    `authorization`, `cookie`, `payload`, `body`, `message`
- Store only scrubbed values in `app_errors`.
