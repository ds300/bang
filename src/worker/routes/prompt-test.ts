import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "../agent/prompts";
import type { PromptContext } from "../agent/prompts";
import { getTools } from "../agent/tools";

const TEST_CONTEXT: PromptContext = {
  nativeLang: "en",
  targetLang: "es",
  cefrLevel: "B1",
  onboarded: true,
  introducingConcepts: [
    { id: 1, name: "Subjunctive mood with querer/esperar", tags: "grammar|subjunctive", notes: null },
    { id: 2, name: "Comparatives with tan/tanto", tags: "grammar|comparisons", notes: "Struggles with gender agreement" },
  ],
  reviewDueConcepts: [
    { id: 3, name: "Preterite vs imperfect", tags: "grammar|past-tenses" },
  ],
  introducingCount: 2,
  reinforcingCount: 12,
  upcomingConceptCount: 4,
  upcomingConcepts: [
    { id: 1, name: "Conditional tense", type: "grammar", priority: "next", source: "curriculum" },
    { id: 2, name: "a lo mejor vs quizás", type: "idiom", priority: "soon", source: "highlight" },
  ],
  recentExerciseResults: [
    { concept_name: "Subjunctive mood with querer/esperar", quality: "pass", exercise_type: "translation", created_at: "2026-02-23" },
    { concept_name: "Preterite vs imperfect", quality: "hard", exercise_type: "listening", created_at: "2026-02-23" },
  ],
  upcomingLessons: [],
  sessionType: "practice",
  sessionLessonDescription: null,
};

const startedAt = new Date().toISOString();

export function handlePromptTestGet(): Response {
  const systemPrompt = buildSystemPrompt(TEST_CONTEXT);
  const tools = getTools();

  return Response.json({
    systemPrompt,
    tools: tools.map((t) => ({ name: t.name, description: t.description })),
    context: TEST_CONTEXT,
    generatedAt: startedAt,
  });
}

export async function handlePromptTestPost(
  request: Request,
  apiKey: string,
): Promise<Response> {
  const body = (await request.json()) as {
    messages: Anthropic.MessageParam[];
  };

  const systemPrompt = buildSystemPrompt(TEST_CONTEXT);
  const tools = getTools();
  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: systemPrompt,
      messages: body.messages,
      tools,
    });

    const textBlocks = response.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((b) => b.text);

    const toolCalls = response.content
      .filter((c): c is Anthropic.ToolUseBlock => c.type === "tool_use")
      .map((t) => ({ name: t.name, input: t.input }));

    return Response.json({
      text: textBlocks.join("\n"),
      toolCalls,
      stopReason: response.stop_reason,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
