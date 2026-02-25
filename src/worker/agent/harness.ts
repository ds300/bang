import Anthropic from "@anthropic-ai/sdk";
import type { AgentStep } from "../../shared/types";
import type { ToolDefinition, ToolExecutionContext } from "./tools";
import { executeTool } from "./tools";

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

export async function runAgentTurn(
  options: HarnessOptions,
): Promise<string> {
  const {
    apiKey,
    systemPrompt,
    messages,
    tools,
    toolContext,
    onStep,
    logAction,
    model = "claude-sonnet-4-6",
  } = options;

  const client = new Anthropic({ apiKey });

  let currentMessages = [...messages];
  const maxIterations = 10;

  for (let i = 0; i < maxIterations; i++) {
    logAction("api_call", {
      model,
      messageCount: currentMessages.length,
      iteration: i,
    });

    onStep({ type: "api_call" });

    let response: Anthropic.Message;
    try {
      console.log("systemPrompt", systemPrompt);
      console.log("currentMessages", currentMessages);
      response = await client.messages.create({
        model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: currentMessages,
        tools: tools.length > 0 ? tools : undefined,
      });
      console.log("yosef", response.content);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 529 && i < maxIterations - 1) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }

    logAction("api_response", {
      stopReason: response.stop_reason,
      contentTypes: response.content.map((c) => c.type),
    });

    if (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (c): c is Anthropic.ToolUseBlock => c.type === "tool_use",
      );

      currentMessages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        onStep({
          type: "tool_call",
          name: toolUse.name,
          input: toolUse.input,
        });

        logAction("tool_call", {
          name: toolUse.name,
          input: toolUse.input,
        });

        const result = executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          toolContext,
        );

        onStep({
          type: "tool_result",
          name: toolUse.name,
          result: JSON.parse(result),
        });

        logAction("tool_result", {
          name: toolUse.name,
          result: JSON.parse(result),
        });

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      currentMessages.push({ role: "user", content: toolResults });
      continue;
    }

    // Extract text from response
    const textBlocks = response.content.filter(
      (c): c is Anthropic.TextBlock => c.type === "text",
    );
    return textBlocks.map((b) => b.text).join("\n");
  }

  return "I'm having trouble responding right now. Please try again.";
}
