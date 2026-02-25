import Anthropic from "@anthropic-ai/sdk";

const translateCache = new Map<string, string>();

async function callWithRetry(
  fn: () => Promise<Anthropic.Message>,
  retries = 3,
): Promise<Anthropic.Message> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 529 && i < retries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Unreachable");
}

export async function handleTranslate(
  request: Request,
  apiKey: string,
): Promise<Response> {
  const body = (await request.json()) as {
    sentence: string;
    lang: string;
    nativeLang?: string;
    context?: string;
  };
  const { sentence, lang, nativeLang = "English", context } = body;

  const cacheKey = `${lang}:${sentence}:${context ?? ""}`;
  const cached = translateCache.get(cacheKey);
  if (cached) return Response.json({ translation: cached });

  const client = new Anthropic({ apiKey });

  const hasMarked = context?.includes("<TRANSLATE_THIS>");
  const prompt = context
    ? hasMarked
      ? `The following text may be in ${lang} or mixed languages. One phrase is marked with <TRANSLATE_THIS> and </TRANSLATE_THIS>—translate only that marked phrase (the exact text between the two tags) to ${nativeLang}. The marked phrase may be a single word and may be in a different language than the surrounding text; still translate it. Do not translate the whole passage or say you don't see the tags.

Return only the translation of the marked phrase. Always wrap in **double asterisks** the part of your translation that most closely maps to the marked phrase. Do this even when it's 1:1 (one word → one word). If you add context for an ambiguous selection, do not bold the context. Example: "el" → "**the**". Example: "segments" → "**segmentos**". Do not expand to a full sentence. No other formatting.

${context}`
      : `The user selected "${sentence}" from this ${lang} text: "${context}". Translate the selected part to ${nativeLang}. Return ONLY the translation, nothing else.`
    : `Translate this ${lang} text to ${nativeLang}. Return ONLY the translation, nothing else.\n\n"${sentence}"`;

  console.log("[translate] prompt sent to LLM:", prompt);

  const response = await callWithRetry(() =>
    client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    }),
  );

  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "";
  const raw = text.trim();
  console.log("[translate] response from LLM:", raw);

  translateCache.set(cacheKey, raw);
  return Response.json({ translation: raw });
}
