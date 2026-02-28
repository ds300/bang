import Anthropic from "@anthropic-ai/sdk";
import type { AgentStep } from "../../shared/types";
import type { ToolDefinition, ToolExecutionContext } from "./tools";
import { executeTool } from "./tools";

/** Shared options for the single agent loop used by both production and eval. */
export interface AgentLoopOptions {
  apiKey: string;
  systemPrompt: string;
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
  /** Invoked for each tool_use; returns JSON string to send back to the model. */
  executeTool: (name: string, input: Record<string, unknown>) => string;
  onStep?: (step: AgentStep) => void;
  logAction?: (type: string, data: unknown) => void;
  model?: string;
  maxIterations?: number;
}

export interface AgentLoopResult {
  responseText: string;
  iterations: number;
  toolCalls: Array<{ name: string; input: Record<string, unknown> }>;
}

const MAX_ITERATIONS_DEFAULT = 10;
const MAX_TOKENS = 2048;

/**
 * Single agent loop: call API, on tool_use run executeTool and continue, otherwise return.
 * Used by both production (runAgentTurn) and eval (evalAgentTurn) so behavior stays in sync.
 */
export async function runAgentLoop(
  options: AgentLoopOptions,
): Promise<AgentLoopResult> {
  const {
    apiKey,
    systemPrompt,
    messages,
    tools,
    executeTool: runTool,
    onStep,
    logAction,
    model = "claude-sonnet-4-6",
    maxIterations = MAX_ITERATIONS_DEFAULT,
  } = options;

  const client = new Anthropic({ apiKey });
  const responseTextParts: string[] = [];
  const toolCalls: Array<{ name: string; input: Record<string, unknown> }> = [];
  let currentMessages = [...messages];

  const noop = () => {};
  const step = onStep ?? noop;
  const log = logAction ?? noop;

  for (let i = 0; i < maxIterations; i++) {
    log("api_call", {
      model,
      messageCount: currentMessages.length,
      iteration: i,
    });
    step({ type: "api_call" });

    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: currentMessages,
        tools: tools.length > 0 ? tools : undefined,
      });
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 529 && i < maxIterations - 1) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }

    log("api_response", {
      stopReason: response.stop_reason,
      contentTypes: response.content.map((c) => c.type),
    });

    if (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (c): c is Anthropic.ToolUseBlock => c.type === "tool_use",
      );
      const textInTurn = response.content
        .filter((c): c is Anthropic.TextBlock => c.type === "text")
        .map((b) => b.text)
        .join("\n");
      if (textInTurn.trim()) responseTextParts.push(textInTurn);

      currentMessages.push({ role: "assistant", content: response.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        const input = toolUse.input as Record<string, unknown>;
        toolCalls.push({ name: toolUse.name, input });

        step({ type: "tool_call", name: toolUse.name, input: toolUse.input });
        log("tool_call", { name: toolUse.name, input: toolUse.input });

        const result = runTool(toolUse.name, input);

        let parsed: unknown;
        try {
          parsed = JSON.parse(result);
        } catch {
          parsed = result;
        }
        step({ type: "tool_result", name: toolUse.name, result: parsed });
        log("tool_result", { name: toolUse.name, result: parsed });

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      currentMessages.push({ role: "user", content: toolResults });
      continue;
    }

    const textBlocks = response.content.filter(
      (c): c is Anthropic.TextBlock => c.type === "text",
    );
    const finalText = textBlocks.map((b) => b.text).join("\n");
    if (finalText.trim()) responseTextParts.push(finalText);

    return {
      responseText: responseTextParts.join("\n\n"),
      iterations: i + 1,
      toolCalls,
    };
  }

  return {
    responseText:
      "I'm having trouble responding right now. Please try again.",
    iterations: maxIterations,
    toolCalls,
  };
}

// --- Production API ---

interface HarnessOptions {
  apiKey: string;
  systemPrompt: string;
  messages: Anthropic.MessageParam[];
  tools: ToolDefinition[];
  toolContext: ToolExecutionContext;
  onStep: (step: AgentStep) => void;
  logAction: (type: string, data: unknown) => void;
  model?: string;
}

export async function runAgentTurn(options: HarnessOptions): Promise<string> {
  const {
    apiKey,
    systemPrompt,
    messages,
    tools,
    toolContext,
    onStep,
    logAction,
    model,
  } = options;

  const result = await runAgentLoop({
    apiKey,
    systemPrompt,
    messages,
    tools,
    executeTool: (name, input) =>
      executeTool(name, input, toolContext),
    onStep,
    logAction,
    model,
  });

  return result.responseText;
}
