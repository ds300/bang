import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { buildSystemPrompt } from "./system-prompt.js";
import { bangToolServer } from "./tools.js";
import {
  readLanguageContext,
  ensureLangDir,
} from "../services/language-files.js";

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
): Promise<SessionHandle> {
  if (activeSession) {
    activeSession.close();
    activeSession = null;
  }

  activeLang = lang;

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
        "mcp__bang__compute_sm2",
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

export function endAgentSession() {
  if (activeSession) {
    activeSession.close();
    activeSession = null;
    activeLang = null;
  }
}
