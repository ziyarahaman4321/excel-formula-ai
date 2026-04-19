import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function POST(req: Request) {
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
      max_tokens: 500,
      system:
        "You are an Excel formula expert. Given a description, return ONLY the formula starting with =. No explanation, no markdown, no quotes, no extra text.",
      messages: [
        {
          role: "user",
          content: description,
        },
      ],
    });

    const firstBlock = message.content[0];
    const formula =
      firstBlock.type === "text" ? firstBlock.text.trim() : "";

    return Response.json({ formula });
  } catch (error) {
    console.error("API Error:", error);
    return Response.json(
      { error: "Failed to generate formula" },
      { status: 500 }
    );
  }
}