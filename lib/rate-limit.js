// Small fixed-window limiter for the API routes. Keyed by uid (or IP before the token is known),
// kept in module memory, so it is per serverless instance and resets on cold start. That is enough to
// stop a runaway client or a script from hammering one warm instance; it is not a global quota.
// ponytail: in-memory per instance; move to Upstash or Vercel Firewall rules if real abuse shows up.
const WINDOW_MS = 60_000;
const buckets = new Map(); // key -> { count, resetAt }

export function rateLimit(key, limit, now = Date.now()) {
  if (buckets.size > 10_000) buckets.clear(); // crude memory cap
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }
  b.count += 1;
  if (b.count > limit) return { ok: false, remaining: 0, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  return { ok: true, remaining: limit - b.count, retryAfter: 0 };
}

export const tooMany = ({ retryAfter }) =>
  Response.json({ error: "too many requests" }, { status: 429, headers: { "Retry-After": String(retryAfter || 60) } });

// Vercel always sets x-forwarded-for; elsewhere (local dev, tests) the IP may be unknown, in which case
// callers skip the IP bucket rather than throw every anonymous request into one shared bucket.
export const clientIp = (req) =>
  (req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "";

// Read a small JSON body without trusting Content-Length (chunked bodies carry none). Returns {} on
// anything oversized or malformed.
export async function readJson(req, maxBytes = 1024) {
  try {
    const text = await req.text();
    if (text.length > maxBytes) return {};
    return JSON.parse(text);
  } catch { return {}; }
}
