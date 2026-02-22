import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { buildSystemPrompt } from "./system-prompt.js";
import { createBangToolServer } from "./tools.js";
import {
  readLanguageContext,
  ensureLangDir,
} from "../services/language-files.js";
import { stripLangTags } from "./strip-tags.js";

export interface ConversationMessage {
  role: string;
  text: string;
}

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
  conversationHistory?: ConversationMessage[],
): Promise<SessionHandle> {
  if (activeSession) {
    activeSession.close();
    activeSession = null;
  }

  activeLang = lang;

  const ctx = await readLanguageContext(lang);
  await ensureLangDir(lang);
  let systemPrompt = buildSystemPrompt(ctx);

  if (conversationHistory && conversationHistory.length > 0) {
    systemPrompt += `\n\n## Session restored after server restart

The session was interrupted by a server restart. Below is the conversation that occurred before the interruption. Continue naturally from where you left off. Do NOT re-introduce yourself, re-greet the user, or repeat any information already covered.

<conversation_history>
${conversationHistory.map((m) => `${m.role === "user" ? "User" : "You"}: ${stripLangTags(m.text)}`).join("\n\n")}
</conversation_history>

Continue the session from here. The user's next message follows.`;
  }

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
        bang: createBangToolServer(),
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
