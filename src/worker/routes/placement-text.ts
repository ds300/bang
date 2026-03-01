import Anthropic from "@anthropic-ai/sdk";

const LANG_NAMES: Record<string, string> = {
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese (Mandarin)",
  ru: "Russian",
  nl: "Dutch",
  en: "English",
};

function langName(code: string): string {
  return LANG_NAMES[code] ?? code;
}

/**
 * System prompt for generating a short placement text (~400 words) with a steep difficulty ramp.
 */
function buildPlacementTextPrompt(targetLang: string): string {
  const name = langName(targetLang);
  return `You are writing a single continuous text in ${name} for language placement. The text must be around 400 words long (no longer).

Requirements:
- Write entirely in ${name}. The text should be a coherent passage (e.g. a short story, a description of a day, or a narrative).
- Difficulty ramps up STEEPLY: start at pre-A1/A1 for only the first 15–20% of the text, then move quickly through A2 (by ~40%), B1 (by ~60%), B2 (by ~80%), and use C1-level vocabulary or structures in the final portion. Do not spend most of the text at low levels—ramp up so that by the second half, B1/B2 content is common.
- Use natural, idiomatic ${name}. No bullet points or lists—one continuous passage.
- Output ONLY the ${name} text. No explanations, no level labels, no meta-commentary.`;
}

export async function handleGeneratePlacementText(
  request: Request,
  apiKey: string,
): Promise<Response> {
  let body: { lang: string };
  try {
    body = (await request.json()) as { lang: string };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.lang) {
    return Response.json({ error: "lang required" }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });
  const system = buildPlacementTextPrompt(body.lang);

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system,
    messages: [
      {
        role: "user",
        content: "Generate the placement text now. Output only the passage in the target language, no other text.",
      },
    ],
  });

  const text =
    response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
  if (!text) {
    return Response.json({ error: "No text generated" }, { status: 500 });
  }

  return Response.json({ text, lang: body.lang });
}
