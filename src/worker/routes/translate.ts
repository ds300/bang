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

  const prompt = context
    ? `The user selected "${sentence}" from this ${lang} text: "${context}". Translate the selected part to ${nativeLang}. Return ONLY the translation, nothing else.`
    : `Translate this ${lang} text to ${nativeLang}. Return ONLY the translation, nothing else.\n\n"${sentence}"`;

  const response = await callWithRetry(() =>
    client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    }),
  );

  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "";
  const translation = text.trim();
  translateCache.set(cacheKey, translation);
  return Response.json({ translation });
}
