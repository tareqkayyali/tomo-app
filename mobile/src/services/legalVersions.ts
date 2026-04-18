/**
 * Legal Versions Service
 *
 * Fetches the current privacy + terms versions from the backend
 * static HTML docs so the signup flow records exactly what the user
 * accepted. The backend register route rejects the submission if the
 * versions the client sends do not match what's currently served.
 *
 * Process-lifetime cache: versions change only on redeploy, so one
 * fetch per cold start is plenty. Failures fall back to `null` and
 * the register call will surface the error from the server.
 */
import { Platform } from 'react-native';
import { API_BASE_URL } from './apiConfig';

export type LegalVersions = {
  privacy: string;
  terms: string;
};

let cache: LegalVersions | null = null;
let inflight: Promise<LegalVersions> | null = null;

const META_RE = /<meta\s+name="tomo-version"\s+content="([^"]+)"\s*\/?>/i;

// In web dev, API_BASE_URL is window.location.origin (the Expo dev
// server at :8082) which doesn't serve /legal/*.html — that's the
// backend at :3000 or the configured EXPO_PUBLIC_API_URL. When the
// same-origin fetch either 404s or returns the Expo dev-server's
// fallback HTML (no tomo-version meta tag), we retry against the
// explicitly-configured backend URL. In production both resolve to
// the same origin so the fallback is a no-op.
function getExplicitBackendUrl(): string | null {
  if (Platform.OS !== 'web') return null;
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!envUrl) return null;
  const normalized = envUrl.replace(/\/$/, '');
  if (typeof window !== 'undefined' && normalized === window.location.origin) {
    return null;
  }
  return normalized;
}

async function fetchVersionFrom(baseUrl: string, path: string): Promise<string> {
  const res = await fetch(`${baseUrl}${path}`, { headers: { accept: 'text/html' } });
  if (!res.ok) throw new Error(`Failed to fetch ${path} from ${baseUrl}: ${res.status}`);
  const html = await res.text();
  const m = html.match(META_RE);
  if (!m) throw new Error(`No tomo-version meta tag in ${baseUrl}${path}`);
  return m[1];
}

async function fetchVersion(path: string): Promise<string> {
  try {
    return await fetchVersionFrom(API_BASE_URL, path);
  } catch (primaryErr) {
    const fallback = getExplicitBackendUrl();
    if (!fallback) throw primaryErr;
    return fetchVersionFrom(fallback, path);
  }
}

export async function getLegalVersions(): Promise<LegalVersions> {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    const [privacy, terms] = await Promise.all([
      fetchVersion('/legal/privacy.html'),
      fetchVersion('/legal/terms.html'),
    ]);
    cache = { privacy, terms };
    return cache;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export function getLegalDocUrl(doc: 'privacy' | 'terms'): string {
  const fallback = getExplicitBackendUrl();
  const base = fallback ?? API_BASE_URL;
  return `${base}/legal/${doc}.html`;
}

export function __resetLegalVersionsCacheForTests(): void {
  cache = null;
  inflight = null;
}
