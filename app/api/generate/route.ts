import Anthropic from "@anthropic-ai/sdk";
// Simple in-memory rate limiter (resets when server restarts)
const requestCounts = new Map<string, { count: number; resetAt: number }>();
const DAILY_LIMIT = 10;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = requestCounts.get(ip);

  if (!record || now > record.resetAt) {
    requestCounts.set(ip, {
      count: 1,
      resetAt: now + 24 * 60 * 60 * 1000, // 24 hours
    });
    return true;
  }

  if (record.count >= DAILY_LIMIT) {
    return false;
  }

  record.count++;
  return true;
}

const client = new Anthropic();

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
if (!checkRateLimit(ip)) {
  return Response.json(
    {
      error: "Daily limit reached (10 questions/day). Upgrade to Pro for unlimited.",
    },
    { status: 429 }
  );
}
  try {
    const { description } = await req.json();

    if (!description || typeof description !== "string") {
      return Response.json(
        { error: "Description is required" },
        { status: 400 }
      );
    }

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      system: `You are an expert Excel and Google Sheets assistant. Your job is to help users with formulas, functions, and spreadsheet tasks.

RESPONSE FORMAT:
You must always respond in this exact JSON structure:
{
  "formula": "the formula starting with =, or empty string if not applicable",
  "explanation": "a clear 1-2 sentence explanation of what it does",
  "steps": ["step 1", "step 2"] or [],
  "alternatives": ["alternative formula 1", "alternative formula 2"] or [],
  "warning": "any caveat or clarification needed, or empty string"
}

RULES:
1. If the request is a clear formula task → fill formula + explanation
2. If the request is ambiguous → make your best guess, fill formula + warning explaining your assumption
3. If it's a manual task (not a formula) → leave formula empty, fill steps with the manual procedure
4. If it needs context (e.g. "lookup customer" without saying from where) → make a reasonable assumption and explain in warning
5. Prefer modern functions: XLOOKUP > VLOOKUP, FILTER > complex IF, UNIQUE for distinct values
6. For non-Excel questions, gently redirect: formula empty, warning explains you only do spreadsheets

EXAMPLES:

Input: "sum column B where A is Saudi"
Output: {"formula":"=SUMIF(A:A,\\"Saudi\\",B:B)","explanation":"Sums all values in column B where the matching cell in column A equals 'Saudi'.","steps":[],"alternatives":["=SUMIFS(B:B,A:A,\\"Saudi\\")"],"warning":""}

Input: "replace column A with column B"
Output: {"formula":"=B1","explanation":"This formula in cell A1 mirrors the value of B1. Drag down to fill column A.","steps":["Click cell A1","Type =B1","Drag the fill handle down to copy"],"alternatives":[],"warning":"For a permanent replacement (not formula), copy column B and paste into column A as values."}

Input: "delete duplicate rows"
Output: {"formula":"","explanation":"Removing duplicates is a built-in Excel feature, not a formula.","steps":["Select your data range","Go to Data tab","Click Remove Duplicates","Choose which columns to check","Click OK"],"alternatives":["Use =UNIQUE(range) to extract unique values to a new location"],"warning":""}

Always respond with valid JSON only. No markdown, no code blocks, no extra text.`,
      messages: [
        {
          role: "user",
          content: description,
        },
      ],
    });

    const firstBlock = message.content[0];
    const rawText = firstBlock.type === "text" ? firstBlock.text.trim() : "";

    // Try to parse the JSON response
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Fallback if JSON parsing fails
      parsed = {
        formula: rawText.startsWith("=") ? rawText : "",
        explanation: rawText.startsWith("=") ? "" : rawText,
        steps: [],
        alternatives: [],
        warning: "",
      };
    }

    return Response.json(parsed);
  } catch (error) {
    console.error("API Error:", error);
    return Response.json(
      { error: "Failed to generate formula" },
      { status: 500 }
    );
  }
}