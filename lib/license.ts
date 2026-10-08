// Pro licence keys, validated against Lemon Squeezy's License API.
//
// Lemon Squeezy is the merchant of record: it takes the payment, handles tax,
// and emails the buyer a licence key. The buyer pastes that key into the app
// and every request carries it in the `x-license-key` header.
//
// https://docs.lemonsqueezy.com/api/license-api/validate-license-key

import { createHash } from "node:crypto";

const VALIDATE_URL = "https://api.lemonsqueezy.com/v1/licenses/validate";
const FRESH_MS = 10 * 60 * 1000; // re-check a good key every 10 minutes
const STALE_MS = 24 * 60 * 60 * 1000; // trust a good key this long if Lemon Squeezy is down
const INVALID_MS = 60 * 1000;

export type LicenseStatus = "valid" | "invalid" | "unavailable" | "disabled";

interface CacheEntry {
  valid: boolean;
  checkedAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Pro is switched on by setting LEMONSQUEEZY_STORE_ID. */
export function proEnabled(): boolean {
  return Boolean(process.env.LEMONSQUEEZY_STORE_ID);
}

export function looksLikeKey(key: unknown): key is string {
  return (
    typeof key === "string" && /^[A-Za-z0-9-]{8,100}$/.test(key.trim())
  );
}

/** Stable, non-reversible id for a key, safe to use in counters and logs. */
export function keyId(key: string): string {
  return createHash("sha256").update(key.trim()).digest("hex").slice(0, 24);
}

function idsMatch(expected: string | undefined, actual: unknown): boolean {
  if (!expected) return true;
  const allowed = expected
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allowed.includes(String(actual));
}

async function askLemonSqueezy(key: string): Promise<LicenseStatus> {
  let res: Response;
  try {
    res = await fetch(VALIDATE_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ license_key: key }).toString(),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
  } catch {
    return "unavailable";
  }

  if (res.status >= 500 || res.status === 429) return "unavailable";

  let data: {
    valid?: unknown;
    meta?: { store_id?: unknown; product_id?: unknown };
  };
  try {
    data = await res.json();
  } catch {
    return "unavailable";
  }

  if (data.valid !== true) return "invalid";

  // Without this check a key bought from any other Lemon Squeezy store would
  // unlock Pro here.
  if (!idsMatch(process.env.LEMONSQUEEZY_STORE_ID, data.meta?.store_id)) {
    return "invalid";
  }
  if (!idsMatch(process.env.LEMONSQUEEZY_PRODUCT_ID, data.meta?.product_id)) {
    return "invalid";
  }
  return "valid";
}

export async function checkLicense(rawKey: unknown): Promise<LicenseStatus> {
  if (!proEnabled()) return "disabled";
  if (!looksLikeKey(rawKey)) return "invalid";

  const key = rawKey.trim();
  const id = keyId(key);
  const now = Date.now();
  const cached = cache.get(id);

  if (cached) {
    const age = now - cached.checkedAt;
    if (cached.valid && age < FRESH_MS) return "valid";
    if (!cached.valid && age < INVALID_MS) return "invalid";
  }

  const status = await askLemonSqueezy(key);

  if (status === "unavailable") {
    // Don't lock out a paying customer because the licence server blipped.
    if (cached?.valid && now - cached.checkedAt < STALE_MS) return "valid";
    return "unavailable";
  }

  if (cache.size > 5000) cache.clear();
  cache.set(id, { valid: status === "valid", checkedAt: now });
  return status;
}

/** Test hook. */
export function _resetLicenseCache(): void {
  cache.clear();
}
