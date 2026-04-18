// Supabase Edge Function: geo-region
//
// Phase 1 of the registration/onboarding overhaul. Resolves the
// client's ISO 3166-1 alpha-2 country code from their request IP so
// the age gate can branch EU/UK 13-15 users into the parental-consent
// flow.
//
// Design principles:
//   1. Server-authoritative. The client never picks its own region;
//      we resolve it here from the request IP and hand back a sealed
//      answer. Mobile passes this back up to /api/v1/user/register.
//   2. Defense in depth. The register route re-checks the IP and
//      ignores any region_code that doesn't match. This function is a
//      convenience for the UI, not a security boundary.
//   3. Fail open to 'unknown'. If geo-IP lookup fails we return
//      region_code = null, requires_parental_consent = false. The
//      register route then defaults to the stricter branch if DOB is
//      under 16 and region is unresolved in EU/UK-likely IPs.
//   4. No external calls when Cloudflare already provides it. Supabase
//      Edge Functions run behind Cloudflare which sets cf-ipcountry.
//      We read that first; external ipapi.co call is a fallback only.
//
// Deployment: `npx supabase functions deploy geo-region --no-verify-jwt`
// The endpoint is intentionally unauthenticated — it runs before the
// user has a session. Rate-limit at the Supabase dashboard.

// EU member states plus UK. GDPR-K floor is 16 (some states lowered to
// 13-15 individually but we use the strict 16 default per plan).
const EU_UK_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "GB", // United Kingdom (post-Brexit, still covered by UK GDPR + AADC)
]);

type GeoResponse = {
  region_code: string | null;
  requires_parental_consent_under_16: boolean;
  source: "cf-ipcountry" | "ipapi" | "unknown";
};

function readCloudflareCountry(headers: Headers): string | null {
  const cf = headers.get("cf-ipcountry");
  if (cf && cf.length === 2 && cf !== "XX" && cf !== "T1") {
    return cf.toUpperCase();
  }
  return null;
}

async function lookupViaIpapi(ip: string): Promise<string | null> {
  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/country/`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const country = (await res.text()).trim().toUpperCase();
    if (country.length === 2 && /^[A-Z]{2}$/.test(country)) return country;
    return null;
  } catch {
    return null;
  }
}

function clientIp(headers: Headers): string | null {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "*";
  const corsHeaders = {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "content-type": "application/json",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: corsHeaders },
    );
  }

  let code: string | null = null;
  let source: GeoResponse["source"] = "unknown";

  code = readCloudflareCountry(req.headers);
  if (code) source = "cf-ipcountry";

  if (!code) {
    const ip = clientIp(req.headers);
    if (ip) {
      code = await lookupViaIpapi(ip);
      if (code) source = "ipapi";
    }
  }

  const body: GeoResponse = {
    region_code: code,
    requires_parental_consent_under_16: code !== null && EU_UK_COUNTRIES.has(code),
    source,
  };

  return new Response(JSON.stringify(body), { status: 200, headers: corsHeaders });
});
