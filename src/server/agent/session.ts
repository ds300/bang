import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { buildSystemPrompt } from "./system-prompt.js";
import { bangToolServer, setSendToFrontend, resolveToolCall } from "./tools.js";
import {
  readLanguageContext,
  ensureLangDir,
} from "../services/language-files.js";
import type { ServerMessage } from "../../shared/protocol.js";

interface SessionHandle {
  sendMessage: (text: string) => void;
  messageStream: () => AsyncGenerator<SDKMessage>;
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
  sendWs: (msg: ServerMessage) => void
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
        exercise: d.exercise,
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
        prompt: "The tutor proposes the following changes. Accept?",
        options: [
          { id: "accept", label: "Accept" },
          { id: "reject", label: "Reject" },
        ],
        toolCallId: d.toolCallId,
      });
    }
  });

  const ctx = await readLanguageContext(lang);
  await ensureLangDir(lang);
  const systemPrompt = buildSystemPrompt(ctx);

  const messageQueue: Array<{ message: string }> = [];
  let waitingForMessage: ((value: void) => void) | null = null;
  let closed = false;

  async function* inputStream(): AsyncGenerator<{
    type: "user";
    message: { role: "user"; content: string };
  }> {
    while (!closed) {
      if (messageQueue.length > 0) {
        const pending = messageQueue.shift()!;
        yield {
          type: "user" as const,
          message: {
            role: "user" as const,
            content: pending.message,
          },
        };
      } else {
        await new Promise<void>((resolve) => {
          waitingForMessage = resolve;
        });
        waitingForMessage = null;
      }
    }
  }

  const q = query({
    prompt: inputStream(),
    options: {
      model: "claude-sonnet-4-6",
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
    },
  });

  function sendMessage(text: string) {
    messageQueue.push({ message: text });
    if (waitingForMessage) {
      waitingForMessage();
    }
  }

  function close() {
    closed = true;
    if (waitingForMessage) {
      waitingForMessage();
    }
  }

  const handle: SessionHandle = {
    sendMessage,
    messageStream: () => q as AsyncGenerator<SDKMessage>,
    close,
  };

  activeSession = handle;
  return handle;
}

export function rewireSend(sendWs: (msg: ServerMessage) => void) {
  if (!activeSession) return;
  setSendToFrontend((toolName, toolCallId, data) => {
    if (toolName === "exercise") {
      const d = data as { exercise: unknown; toolCallId: string };
      sendWs({
        type: "exercise",
        exercise: d.exercise,
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
        prompt: "The tutor proposes the following changes. Accept?",
        options: [
          { id: "accept", label: "Accept" },
          { id: "reject", label: "Reject" },
        ],
        toolCallId: d.toolCallId,
      });
    }
  });
}

export function endAgentSession() {
  if (activeSession) {
    activeSession.close();
    activeSession = null;
    activeLang = null;
  }
}

export { resolveToolCall };
