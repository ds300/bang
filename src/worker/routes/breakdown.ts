import Anthropic from "@anthropic-ai/sdk";

const breakdownCache = new Map<string, string>();

async function callStreamWithRetry(
  fn: () => Promise<AsyncIterable<Anthropic.MessageStreamEvent>>,
  retries = 3
): Promise<AsyncIterable<Anthropic.MessageStreamEvent>> {
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
  apiKey: string
): Promise<Response> {
  const body = (await request.json()) as {
    sentence: string;
    lang: string;
    nativeLang?: string;
    context?: string;
  };
  const { sentence, lang, nativeLang = "English", context } = body;

  const cacheKey = `${lang}:${sentence}:${context ?? ""}`;
  const cached = breakdownCache.get(cacheKey);
  if (cached) {
    return Response.json({ breakdown: cached });
  }

  const client = new Anthropic({ apiKey });

  const contextNote = context
    ? `\n\nThis selection comes from the following full message:\n"${context}"`
    : "";

  const stream = await callStreamWithRetry(async () => {
    const s = client.messages.stream({
      model: "claude-haiku-4-5",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `Give a brief grammatical breakdown of this ${lang} text for a ${nativeLang} speaker. Be concise — a few short bullet points, not an essay. Use markdown list syntax (- ) for each point.\n\n"${sentence}"${contextNote}\n\nCover: meaning, key grammar (tense, mood), and any non-obvious vocabulary. Skip anything a beginner would already know. Use ${nativeLang} for explanations.`,
        },
      ],
    });
    return s;
  });

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  let fullText = "";

  (async () => {
    try {
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          const chunk = event.delta.text;
          fullText += chunk;
          await writer.write(
            encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`)
          );
        }
      }
      breakdownCache.set(cacheKey, fullText);
      await writer.write(encoder.encode("data: [DONE]\n\n"));
    } catch (err) {
      await writer.write(
        encoder.encode(
          `data: ${JSON.stringify({ error: "Stream failed" })}\n\n`
        )
      );
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function handleBreakdownAsk(
  request: Request,
  apiKey: string
): Promise<Response> {
  const body = (await request.json()) as {
    sentence: string;
    lang: string;
    question: string;
    context?: string;
  };
  const { sentence, lang, question, context = "" } = body;

  const client = new Anthropic({ apiKey });

  const stream = await callStreamWithRetry(async () => {
    const s = client.messages.stream({
      model: "claude-haiku-4-5",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `Context: A language learner is studying this ${lang} sentence: "${sentence}"\n\n${
            context ? `Previous breakdown:\n${context}\n\n` : ""
          }The learner asks: "${question}"\n\nAnswer their question clearly and helpfully, in English. If relevant, provide examples.`,
        },
      ],
    });
    return s;
  });

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    try {
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          await writer.write(
            encoder.encode(
              `data: ${JSON.stringify({ text: event.delta.text })}\n\n`
            )
          );
        }
      }
      await writer.write(encoder.encode("data: [DONE]\n\n"));
    } catch {
      await writer.write(
        encoder.encode(
          `data: ${JSON.stringify({ error: "Stream failed" })}\n\n`
        )
      );
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
