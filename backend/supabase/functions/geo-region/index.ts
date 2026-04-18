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
//   4. Provider chain:
//        (a) cf-ipcountry header (set when routed via Cloudflare —
//            never by default on Supabase Edge Runtime, but cheap to
//            probe in case the ingress changes)
//        (b) api.country.is — HTTPS, free, no auth, ~150ms median.
//            Picked after ipapi.co failed in production due to a
//            Cloudflare bot challenge that 403s every unauthenticated
//            call.
//        (c) ipinfo.io/{ip}/country — secondary fallback if (b) is
//            down or rate-limited. Also HTTPS, no auth, plain-text.
//
// Deployment: `npx supabase functions deploy geo-region --no-verify-jwt --project-ref <ref>`
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

type GeoSource = "cf-ipcountry" | "country.is" | "ipinfo" | "unknown";

type GeoResponse = {
  region_code: string | null;
  requires_parental_consent_under_16: boolean;
  source: GeoSource;
  // Lightweight diagnostic: IP prefix we attempted to resolve. Helps
  // debug prod without leaking the full address.
  ip_hint: string | null;
};

function readCloudflareCountry(headers: Headers): string | null {
  const cf = headers.get("cf-ipcountry");
  if (cf && cf.length === 2 && cf !== "XX" && cf !== "T1") {
    return cf.toUpperCase();
  }
  return null;
}

function isValidIsoAlpha2(s: string | null | undefined): string | null {
  if (!s) return null;
  const up = s.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(up) ? up : null;
}

async function lookupViaCountryIs(ip: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.country.is/${encodeURIComponent(ip)}`, {
      signal: AbortSignal.timeout(1500),
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { country?: string };
    return isValidIsoAlpha2(json.country);
  } catch {
    return null;
  }
}

async function lookupViaIpinfo(ip: string): Promise<string | null> {
  try {
    const res = await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}/country`, {
      signal: AbortSignal.timeout(1500),
      headers: { accept: "text/plain" },
    });
    if (!res.ok) return null;
    return isValidIsoAlpha2(await res.text());
  } catch {
    return null;
  }
}

function clientIp(req: Request): string | null {
  const headers = req.headers;
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  // Deno's Deno.serve handler info is not available through this
  // signature; leaving remoteAddr fallback off until we see a case
  // where the headers above don't populate.
  return null;
}

function ipHint(ip: string | null): string | null {
  if (!ip) return null;
  // Return only the first two octets (IPv4) or the first 4 groups
  // (IPv6) — enough to narrow an investigation without logging the
  // full address.
  if (ip.includes(":")) {
    return ip.split(":").slice(0, 4).join(":") + "::";
  }
  return ip.split(".").slice(0, 2).join(".") + ".x.x";
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "*";
  const corsHeaders = {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type, authorization, apikey",
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
  let source: GeoSource = "unknown";

  code = readCloudflareCountry(req.headers);
  if (code) source = "cf-ipcountry";

  const ip = clientIp(req);

  if (!code && ip) {
    code = await lookupViaCountryIs(ip);
    if (code) source = "country.is";
  }

  if (!code && ip) {
    code = await lookupViaIpinfo(ip);
    if (code) source = "ipinfo";
  }

  const body: GeoResponse = {
    region_code: code,
    requires_parental_consent_under_16: code !== null && EU_UK_COUNTRIES.has(code),
    source,
    ip_hint: ipHint(ip),
  };

  return new Response(JSON.stringify(body), { status: 200, headers: corsHeaders });
});
