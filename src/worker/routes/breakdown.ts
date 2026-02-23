import Anthropic from "@anthropic-ai/sdk";

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

export async function handleBreakdown(
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

  const client = new Anthropic({ apiKey });

  const contextNote = context
    ? `\n\nThis selection comes from the following full message:\n"${context}"`
    : "";

  const response = await callWithRetry(() =>
    client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `Give a brief grammatical breakdown of this ${lang} text for a ${nativeLang} speaker. Be concise — a few short bullet points, not an essay.\n\n"${sentence}"${contextNote}\n\nCover: meaning, key grammar (tense, mood), and any non-obvious vocabulary. Skip anything a beginner would already know. Use ${nativeLang} for explanations.\n\nEnd with a JSON block of learnable items:\n\`\`\`json\n[{ "concept": "...", "type": "vocabulary | grammar | idiom" }]\n\`\`\``,
        },
      ],
    }),
  );

  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "";
  return Response.json({ breakdown: text });
}

export async function handleBreakdownAsk(
  request: Request,
  apiKey: string,
): Promise<Response> {
  const body = (await request.json()) as {
    sentence: string;
    lang: string;
    question: string;
    context?: string;
  };
  const { sentence, lang, question, context = "" } = body;

  const client = new Anthropic({ apiKey });

  const response = await callWithRetry(() =>
    client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `Context: A language learner is studying this ${lang} sentence: "${sentence}"\n\n${
            context ? `Previous breakdown:\n${context}\n\n` : ""
          }The learner asks: "${question}"\n\nAnswer their question clearly and helpfully, in English. If relevant, provide examples.`,
        },
      ],
    }),
  );

  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "";
  return Response.json({ answer: text });
}
