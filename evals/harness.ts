import type Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "../src/worker/agent/prompts";
import { getTools } from "../src/worker/agent/tools";
import { runAgentLoop } from "../src/worker/agent/harness";
import type { PromptContext } from "../src/worker/agent/prompts";

export interface RecordedToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface EvalResult {
  toolCalls: RecordedToolCall[];
  responseText: string;
  iterations: number;
}

export interface EvalScenario {
  name: string;
  tags: string[];
  description: string;
  context: PromptContext;
  messages: Anthropic.MessageParam[];
  rubric: RubricItem[];
}

export interface RubricItem {
  description: string;
  critical: boolean;
}

let nextConceptId = 100;

export function mockToolResult(
  name: string,
  input: Record<string, unknown>,
): string {
  switch (name) {
    case "add_upcoming_concept":
      return JSON.stringify({ success: true, concept_id: nextConceptId++ });
    case "add_concepts": {
      const concepts = (input.concepts as Array<{ name: string }>) ?? [];
      const added = concepts.map((c) => ({
        id: nextConceptId++,
        name: c.name,
      }));
      return JSON.stringify({
        success: true,
        added: added.length,
        concepts: added,
      });
    }
    case "record_exercise_result":
      return JSON.stringify({
        success: true,
        recalled: (input.quality as string) !== "fail",
        next_review: new Date(Date.now() + 86400000).toISOString(),
        interval_days: 1,
      });
    case "search_concepts":
      return JSON.stringify({ results: [] });
    case "get_learned_concepts":
      return JSON.stringify({ concepts: [], total: 0 });
    case "update_session":
      return JSON.stringify({ success: true });
    case "record_vocab":
      return JSON.stringify({
        success: true,
        recorded: { seen: 0, produced: 0, heard: 0 },
      });
    case "move_concept":
      return JSON.stringify({
        success: true,
        from: "introducing",
        to: input.new_state,
      });
    case "update_concept":
      return JSON.stringify({ success: true });
    case "remove_upcoming_concept":
      return JSON.stringify({ success: true });
    case "prioritize_upcoming_concept":
      return JSON.stringify({ success: true });
    case "plan_lessons":
      return JSON.stringify({ success: true, planned: [{ id: 1, seq: 1 }] });
    case "set_profile":
    case "set_lang_profile":
      return JSON.stringify({ success: true });
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

export async function evalAgentTurn(
  scenario: EvalScenario,
  apiKey: string,
  model = "claude-sonnet-4-6",
): Promise<EvalResult> {
  nextConceptId = 100;

  const result = await runAgentLoop({
    apiKey,
    systemPrompt: buildSystemPrompt(scenario.context),
    messages: scenario.messages,
    tools: getTools({ includeProfileTools: !scenario.context.onboarded }),
    executeTool: mockToolResult,
    model,
  });

  return {
    toolCalls: result.toolCalls,
    responseText: result.responseText,
    iterations: result.iterations,
  };
}
