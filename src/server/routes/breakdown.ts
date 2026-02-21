import type { FastifyInstance } from "fastify";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export async function breakdownRoutes(app: FastifyInstance) {
  app.post<{
    Body: { sentence: string; lang: string; nativeLang?: string };
  }>("/api/translate", async (request) => {
    const { sentence, lang, nativeLang = "English" } = request.body;

    const response = await anthropic.messages.create({
      model: "claude-haiku-3-5-20241022",
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

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `Provide a grammatical breakdown of this ${lang} sentence for a ${nativeLang} speaker learning ${lang}. 

Sentence: "${sentence}"

Explain:
1. The overall meaning and any idiomatic usage
2. Key grammatical structures (verb conjugations, tenses, mood, agreements)
3. Notable vocabulary with translations
4. Why certain words/forms are used (e.g., why subjunctive here, why this preposition)

Keep it clear and educational. Use ${nativeLang} for explanations. Format as markdown with the original sentence at the top.

At the end, list individual words/concepts that could be added to a learning queue, formatted as a JSON code block:
\`\`\`json
[
  { "concept": "word or concept", "type": "vocabulary | grammar | idiom" }
]
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

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `Context: A language learner is studying this ${lang} sentence: "${sentence}"

${context ? `Previous breakdown:\n${context}\n\n` : ""}The learner asks: "${question}"

Answer their question clearly and helpfully, in English. If relevant, provide examples.`,
        },
      ],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    return { answer: text };
  });
}
