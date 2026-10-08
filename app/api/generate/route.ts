import Anthropic from "@anthropic-ai/sdk";
import {
  buildSystemPrompt,
  buildUserMessage,
  maxTokensFor,
  parseAnswer,
  parseRequest,
  type Plan,
} from "@/lib/formula";
import { checkLicense, keyId } from "@/lib/license";
import { consume, envInt } from "@/lib/usage";

// Haiku is fast and costs a fraction of a cent per formula. Override with
// ANTHROPIC_MODEL if you want a larger model.
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ maxRetries: 1, timeout: 30_000 });
  return client;
}

function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

export async function POST(req: Request) {
  // 1. Work out the caller's plan.
  const licenseKey = req.headers.get("x-license-key");
  let plan: Plan = "free";
  let notice = "";
  let userId = `ip:${clientIp(req)}`;

  if (licenseKey) {
    const status = await checkLicense(licenseKey);
    if (status === "valid") {
      plan = "pro";
      userId = `key:${keyId(licenseKey)}`;
    } else if (status === "unavailable") {
      notice =
        "We couldn't verify your licence just now, so this request used the free plan. Try again in a minute.";
    } else {
      return Response.json(
        {
          error:
            "That licence key isn't valid any more. Remove it or enter a current one.",
          code: "license_invalid",
        },
        { status: 401 }
      );
    }
  }

  // 2. Validate the request against what that plan allows.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: "Invalid request.", code: "bad_json" },
      { status: 400 }
    );
  }

  const parsed = parseRequest(body, plan);
  if (!parsed.ok) {
    return Response.json(
      { error: parsed.error, code: parsed.code },
      { status: parsed.status }
    );
  }

  // 3. Per-user daily limit.
  const limit =
    plan === "pro"
      ? envInt("PRO_DAILY_LIMIT", 200)
      : envInt("FREE_DAILY_LIMIT", 5);
  const usage = await consume(userId, limit);
  const usageInfo = { plan, used: usage.used, limit: usage.limit };

  if (!usage.allowed) {
    return Response.json(
      {
        error:
          plan === "pro"
            ? `You've reached today's fair-use limit of ${limit} answers. It resets at midnight UTC.`
            : `You've used your ${limit} free answers for today. Upgrade to Pro for more, or come back tomorrow.`,
        code: "limit_reached",
        usage: usageInfo,
      },
      { status: 429 }
    );
  }

  // 4. Site-wide circuit breaker so a traffic spike can't drain the API balance.
  const globalUsage = await consume("global", envInt("GLOBAL_DAILY_CAP", 3000));
  if (!globalUsage.allowed) {
    return Response.json(
      {
        error: "We're at capacity for today. Please try again tomorrow.",
        code: "capacity",
        usage: usageInfo,
      },
      { status: 503 }
    );
  }

  // 5. Ask Claude.
  try {
    const { request } = parsed;
    const message = await anthropic().messages.create({
      model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      max_tokens: maxTokensFor(request.target),
      system: buildSystemPrompt(request.mode, request.target),
      messages: [{ role: "user", content: buildUserMessage(request) }],
    });

    const rawText = message.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();

    return Response.json({
      ...parseAnswer(rawText),
      usage: usageInfo,
      notice,
    });
  } catch (error) {
    console.error("API Error:", error);
    return Response.json(
      {
        error: "Failed to generate an answer. Please try again.",
        code: "upstream",
        usage: usageInfo,
      },
      { status: 502 }
    );
  }
}
