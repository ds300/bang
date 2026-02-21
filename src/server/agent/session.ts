import {
  unstable_v2_createSession,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { buildSystemPrompt } from "./system-prompt.js";
import { bangToolServer, setSendToFrontend, resolveToolCall } from "./tools.js";
import {
  readLanguageContext,
  ensureLangDir,
} from "../services/language-files.js";
import type { ServerMessage } from "../../shared/protocol.js";

interface SessionHandle {
  send: (message: string) => Promise<void>;
  stream: () => AsyncGenerator<SDKMessage>;
  close: () => void;
}

let activeSession: SessionHandle | null = null;
let activeLang: string | null = null;

export function getActiveSession() {
  return activeSession;
}

export function getActiveLang() {
  return activeLang;
}

export async function startAgentSession(
  lang: string,
  sendWs: (msg: ServerMessage) => void,
): Promise<SessionHandle> {
  if (activeSession) {
    activeSession.close();
    activeSession = null;
  }

  activeLang = lang;

  setSendToFrontend((toolName, toolCallId, data) => {
    if (toolName === "exercise") {
      const d = data as { exercise: unknown; toolCallId: string };
      sendWs({
        type: "exercise",
        exercise: d.exercise as ServerMessage extends { type: "exercise" }
          ? ServerMessage["exercise"]
          : never,
        toolCallId: d.toolCallId,
      } as ServerMessage);
    } else if (toolName === "options") {
      const d = data as {
        prompt: string;
        options: Array<{ id: string; label: string; description?: string }>;
        toolCallId: string;
      };
      sendWs({
        type: "options",
        prompt: d.prompt,
        options: d.options,
        toolCallId: d.toolCallId,
      });
    } else if (toolName === "propose_file_changes") {
      const d = data as { proposals: unknown; toolCallId: string };
      sendWs({
        type: "options",
        prompt:
          "The tutor proposes the following changes. Accept?",
        options: [
          { id: "accept", label: "Accept" },
          { id: "reject", label: "Reject" },
        ],
        toolCallId: d.toolCallId,
      });
    }
  });

  await ensureLangDir(lang);
  const ctx = await readLanguageContext(lang);
  const systemPrompt = buildSystemPrompt(ctx);

  const session = unstable_v2_createSession({
    model: "claude-sonnet-4-20250514",
    systemPrompt,
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    cwd: process.cwd(),
    allowedTools: [
      "Read",
      "Write",
      "Edit",
      "Glob",
      "Bash",
      "mcp__bang__present_exercise",
      "mcp__bang__present_options",
      "mcp__bang__compute_sm2",
      "mcp__bang__propose_file_changes",
    ],
    mcpServers: {
      bang: bangToolServer,
    },
  });

  activeSession = session;
  return session;
}

export function endAgentSession() {
  if (activeSession) {
    activeSession.close();
    activeSession = null;
    activeLang = null;
  }
}

export { resolveToolCall };
