import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { computeSM2 } from "../lib/sm2.js";

type PendingResolve = (value: { content: Array<{ type: "text"; text: string }> }) => void;
const pendingToolCalls = new Map<string, PendingResolve>();

/**
 * Called by the WebSocket handler when the frontend responds to a tool call.
 */
export function resolveToolCall(toolCallId: string, data: unknown) {
  const resolve = pendingToolCalls.get(toolCallId);
  if (resolve) {
    pendingToolCalls.delete(toolCallId);
    resolve({
      content: [{ type: "text" as const, text: JSON.stringify(data) }],
    });
  }
}

/**
 * Waits for the frontend to respond to a tool call.
 * The `onPresent` callback should send the tool call data to the frontend via WebSocket.
 */
function waitForFrontend(
  toolCallId: string,
  onPresent: () => void,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  return new Promise((resolve) => {
    pendingToolCalls.set(toolCallId, resolve);
    onPresent();
  });
}

let sendToFrontend: ((toolName: string, toolCallId: string, data: unknown) => void) | null = null;

export function setSendToFrontend(
  fn: (toolName: string, toolCallId: string, data: unknown) => void,
) {
  sendToFrontend = fn;
}

let toolCallCounter = 0;
function nextToolCallId(): string {
  return `tc_${++toolCallCounter}_${Date.now()}`;
}

export const bangToolServer = createSdkMcpServer({
  name: "bang",
  version: "1.0.0",
  tools: [
    tool(
      "present_exercise",
      `Present an exercise to the user. The exercise will be rendered in the chat UI and the user's answer will be returned.

Types:
- listening: Play audio of targetText. Text is hidden. User translates to English. Include targetText for audio playback.
- translation: Show nativeText. User translates to target language.
- writing_prompt: Show concepts/vocab. User constructs a sentence using them.
- spot_the_error: Show a sentence with an error. User identifies and corrects it.`,
      {
        exerciseType: z
          .enum(["listening", "translation", "writing_prompt", "spot_the_error"])
          .describe("The type of exercise"),
        prompt: z
          .string()
          .describe("Instructions/prompt shown to the user"),
        targetText: z
          .string()
          .optional()
          .describe("Target-language sentence (hidden for listening exercises)"),
        nativeText: z
          .string()
          .optional()
          .describe("Native-language sentence (for translation exercises)"),
        concepts: z
          .array(z.string())
          .optional()
          .describe("Concepts/vocab to use (for writing prompts)"),
      },
      async (args) => {
        const id = nextToolCallId();
        return waitForFrontend(id, () => {
          sendToFrontend?.("exercise", id, {
            exercise: {
              type: args.exerciseType,
              id,
              prompt: args.prompt,
              targetText: args.targetText,
              nativeText: args.nativeText,
              concepts: args.concepts,
            },
            toolCallId: id,
          });
        });
      },
    ),

    tool(
      "present_options",
      "Present clickable options to the user and wait for their selection. Use this for session type selection, confirmations, or any multiple-choice interaction.",
      {
        prompt: z.string().describe("The question or instruction to show"),
        options: z
          .array(
            z.object({
              id: z.string().describe("Unique option identifier"),
              label: z.string().describe("Display text"),
              description: z
                .string()
                .optional()
                .describe("Additional description"),
            }),
          )
          .describe("The options to present"),
      },
      async (args) => {
        const id = nextToolCallId();
        return waitForFrontend(id, () => {
          sendToFrontend?.("options", id, {
            prompt: args.prompt,
            options: args.options,
            toolCallId: id,
          });
        });
      },
    ),

    tool(
      "compute_sm2",
      "Compute the next SM-2 spaced repetition state for an item given a quality score. Returns updated repetitions, easiness factor, interval, and next review date.",
      {
        quality: z
          .number()
          .min(0)
          .max(5)
          .describe(
            "Quality of response: 0=complete blackout, 1=incorrect but remembered on seeing answer, 2=incorrect but easy to recall, 3=correct with serious difficulty, 4=correct after hesitation, 5=perfect response",
          ),
        currentRepetitions: z.number().optional().describe("Current repetition count"),
        currentEasiness: z.number().optional().describe("Current easiness factor"),
        currentInterval: z.number().optional().describe("Current interval in days"),
      },
      async (args) => {
        const result = computeSM2(args.quality, {
          repetitions: args.currentRepetitions,
          easiness: args.currentEasiness,
          interval: args.currentInterval,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
      },
    ),

    tool(
      "propose_file_changes",
      "Propose moving items between current.md, review.md, and learned.md. The proposal is shown to the user for confirmation before any changes are made. Returns whether the user accepted or rejected.",
      {
        proposals: z
          .array(
            z.object({
              concept: z.string().describe("The concept or vocab item"),
              from: z
                .enum(["current", "review", "learned"])
                .describe("Source file"),
              to: z
                .enum(["current", "review", "learned"])
                .describe("Destination file"),
              reason: z
                .string()
                .describe("Why this move is being proposed"),
            }),
          )
          .describe("List of proposed moves"),
      },
      async (args) => {
        const id = nextToolCallId();
        return waitForFrontend(id, () => {
          sendToFrontend?.("propose_file_changes", id, {
            proposals: args.proposals,
            toolCallId: id,
          });
        });
      },
    ),
  ],
});
