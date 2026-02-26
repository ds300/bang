import Anthropic from "@anthropic-ai/sdk";

const translateCache = new Map<string, string>();

async function callWithRetry(
  fn: () => Promise<Anthropic.Message>,
  retries = 3
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

function buildTranslationMessages(
  nativeLang: string,
  selectedText: string,
  fullContext: string
): { system: string; user: string } {
  const system = `You are a word-for-word translator to ${nativeLang}. You receive a phrase and optional context. Replace every non-${nativeLang} word with its ${nativeLang} equivalent. Keep punctuation and structure. Do not extend the phrase. Return ONLY the translated words.`;

  const user = `Example:
<context>Ella dijo "por supuesto" sin pensarlo dos veces.</context>
<phrase>"por supuesto" sin</phrase>
→ "of course" without

Now translate:
<context>${fullContext}</context>
<phrase>${selectedText}</phrase>
→`;

  return { system, user };
}

export async function handleTranslate(
  request: Request,
  apiKey: string
): Promise<Response> {
  const body = (await request.json()) as {
    lang: string;
    nativeLang?: string;
    context: string;
  };
  const { lang, nativeLang = "English", context } = body;

  const cacheKey = `${lang}:${context}`;
  const cached = translateCache.get(cacheKey);
  if (cached) return Response.json({ translation: cached });

  const client = new Anthropic({ apiKey });

  const tagMatch = context.match(/<translate>([\s\S]*?)<\/translate>/);
  const selectedText = tagMatch?.[1]?.trim() ?? "";
  const fullContext = context.replace(/<\/?translate>/g, "");

  let raw = "";
  const { system, user } = buildTranslationMessages(nativeLang, selectedText, fullContext);
  console.log(
    "[translate] prompt sent to LLM (marked, pass 1):",
    system,
    "\n",
    user
  );
  // Cap output tokens: rough estimate ~1 token per 4 chars, with 3x headroom, minimum 30
  const estimatedTokens = Math.max(30, Math.ceil((selectedText.length / 4) * 3));
  const response = await callWithRetry(() =>
    client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: estimatedTokens,
      system,
      messages: [{ role: "user", content: user }],
    })
  );
  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "";
  raw = text.trim();
  // Strip wrapping quotes the model sometimes echoes back
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1);
  }

  console.log("[translate] response from LLM:", raw);

  translateCache.set(cacheKey, raw);
  return Response.json({ translation: raw });
}
