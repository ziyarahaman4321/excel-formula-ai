// Daily usage counters.
//
// Uses Upstash Redis over its REST API when configured, so counts survive
// across Vercel's serverless instances. Without Redis it falls back to an
// in-memory map, which is fine for local development but resets on every cold
// start in production.

export interface UsageResult {
  allowed: boolean;
  used: number;
  limit: number;
}

const memory = new Map<string, { count: number; expiresAt: number }>();
const TTL_SECONDS = 60 * 60 * 48;

function redisConfig(): { url: string; token: string } | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}

export function usingDurableStore(): boolean {
  return redisConfig() !== null;
}

/** Counters roll over at 00:00 UTC. */
export function dayStamp(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

async function redisIncr(key: string): Promise<number | null> {
  const cfg = redisConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, TTL_SECONDS],
      ]),
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const first = Array.isArray(data) ? data[0] : null;
    const value =
      first && typeof first === "object" && "result" in first
        ? (first as { result: unknown }).result
        : null;
    return typeof value === "number" ? value : null;
  } catch {
    return null;
  }
}

function memoryIncr(key: string): number {
  const now = Date.now();
  if (memory.size > 5000) {
    for (const [k, v] of memory) {
      if (v.expiresAt < now) memory.delete(k);
    }
  }
  const entry = memory.get(key);
  if (!entry || entry.expiresAt < now) {
    memory.set(key, { count: 1, expiresAt: now + TTL_SECONDS * 1000 });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

/**
 * Count one use against `id` for today and report whether it is within
 * `limit`. If Redis is configured but unreachable, the in-memory counter is
 * used so a Redis outage never takes the app down.
 */
export async function consume(id: string, limit: number): Promise<UsageResult> {
  const key = `efa:${dayStamp()}:${id}`;
  const count = (await redisIncr(key)) ?? memoryIncr(key);
  return {
    allowed: count <= limit,
    used: Math.min(count, limit),
    limit,
  };
}

export function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
