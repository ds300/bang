import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { computeSM2 } from "../lib/sm2.js";

export function createBangToolServer() {
  return createSdkMcpServer({
    name: "bang",
    version: "1.0.0",
    tools: [
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
    ],
  });
}
