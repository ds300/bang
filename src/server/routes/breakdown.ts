import type { FastifyInstance } from "fastify";
import Anthropic from "@anthropic-ai/sdk";

let _anthropic: Anthropic | null = null;
function getClient() {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}

export async function breakdownRoutes(app: FastifyInstance) {
  app.post<{
    Body: { sentence: string; lang: string; nativeLang?: string };
  }>("/api/translate", async (request) => {
    const { sentence, lang, nativeLang = "English" } = request.body;

    const response = await getClient().messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `Translate this ${lang} sentence to ${nativeLang}. Return ONLY the translation, nothing else.\n\n"${sentence}"`,
        },
      ],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    return { translation: text.trim() };
  });

  app.post<{
    Body: {
      sentence: string;
      lang: string;
      nativeLang?: string;
    };
  }>("/api/breakdown", async (request) => {
    const { sentence, lang, nativeLang = "English" } = request.body;

    const response = await getClient().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `Give a brief grammatical breakdown of this ${lang} sentence for a ${nativeLang} speaker. Be concise — a few short bullet points, not an essay.

"${sentence}"

Cover: meaning, key grammar (tense, mood), and any non-obvious vocabulary. Skip anything a beginner would already know. Use ${nativeLang} for explanations.

End with a JSON block of learnable items:
\`\`\`json
[{ "concept": "...", "type": "vocabulary | grammar | idiom" }]
\`\`\``,
        },
      ],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    return { breakdown: text };
  });

  app.post<{
    Body: {
      sentence: string;
      lang: string;
      question: string;
      context?: string;
    };
  }>("/api/breakdown/ask", async (request) => {
    const { sentence, lang, question, context = "" } = request.body;

    const response = await getClient().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `Context: A language learner is studying this ${lang} sentence: "${sentence}"

${
  context ? `Previous breakdown:\n${context}\n\n` : ""
}The learner asks: "${question}"

Answer their question clearly and helpfully, in English. If relevant, provide examples.`,
        },
      ],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    return { answer: text };
  });
}
