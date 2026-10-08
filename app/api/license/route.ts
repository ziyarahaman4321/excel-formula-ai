import { checkLicense } from "@/lib/license";
import { consume } from "@/lib/usage";

// Checks a licence key when the buyer first pastes it in, so the UI can say
// straight away whether Pro is unlocked.
export async function POST(req: Request) {
  const ip =
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown";

  // Stops anyone guessing keys in bulk.
  const attempts = await consume(`license-check:${ip}`, 20);
  if (!attempts.allowed) {
    return Response.json(
      { valid: false, error: "Too many attempts. Try again tomorrow." },
      { status: 429 }
    );
  }

  let key: unknown;
  try {
    key = ((await req.json()) as { key?: unknown })?.key;
  } catch {
    return Response.json(
      { valid: false, error: "Invalid request." },
      { status: 400 }
    );
  }

  const status = await checkLicense(key);

  switch (status) {
    case "valid":
      return Response.json({ valid: true });
    case "unavailable":
      return Response.json(
        {
          valid: false,
          error: "Couldn't reach the licence server. Try again in a minute.",
        },
        { status: 503 }
      );
    case "disabled":
      return Response.json(
        { valid: false, error: "Pro isn't available yet." },
        { status: 503 }
      );
    default:
      return Response.json(
        {
          valid: false,
          error:
            "That key isn't valid. Check for typos, or that the subscription is still active.",
        },
        { status: 200 }
      );
  }
}
