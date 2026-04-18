/**
 * Geo Region Service
 *
 * Calls the Supabase Edge Function `geo-region` to resolve the
 * athlete's ISO 3166-1 alpha-2 country code from their request IP.
 *
 * The register backend re-checks the request IP and overrides the
 * client value — this call is a UX hint only, letting the age gate
 * show different copy for EU/UK minors before the account is created.
 *
 * The Edge Function URL is derived from NEXT_PUBLIC_SUPABASE_URL;
 * fallback to the configured EXPO_PUBLIC_SUPABASE_URL. If neither is
 * set we return a null result and the register route defaults the
 * region on its own.
 */
import Constants from 'expo-constants';

export type GeoRegion = {
  regionCode: string | null;
  requiresParentalConsentUnder16: boolean;
  source: 'cf-ipcountry' | 'ipapi' | 'unknown';
};

const FALLBACK: GeoRegion = {
  regionCode: null,
  requiresParentalConsentUnder16: false,
  source: 'unknown',
};

function resolveFunctionsUrl(): string | null {
  const fromExtra = Constants.expoConfig?.extra?.supabaseUrl as string | undefined;
  const fromEnv = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const base = fromExtra || fromEnv;
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/functions/v1/geo-region`;
}

let cache: GeoRegion | null = null;

export async function getGeoRegion(timeoutMs = 1500): Promise<GeoRegion> {
  if (cache) return cache;

  const url = resolveFunctionsUrl();
  if (!url) return FALLBACK;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    if (!res.ok) return FALLBACK;
    const json = await res.json();
    cache = {
      regionCode: json.region_code ?? null,
      requiresParentalConsentUnder16: !!json.requires_parental_consent_under_16,
      source: json.source ?? 'unknown',
    };
    return cache;
  } catch {
    return FALLBACK;
  } finally {
    clearTimeout(timer);
  }
}

export function __resetGeoRegionCacheForTests(): void {
  cache = null;
}
