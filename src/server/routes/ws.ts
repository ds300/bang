import type { FastifyInstance } from "fastify";
import type { ClientMessage, ServerMessage } from "../../shared/protocol.js";
import {
  startAgentSession,
  endAgentSession,
  getActiveSession,
  getActiveLang,
} from "../agent/session.js";
import {
  cancelIdleTimer,
  resetProcessedMessageCount,
} from "../services/idle-processor.js";
import { commitAndPush, hasChanges } from "../services/git.js";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

export async function wsRoute(app: FastifyInstance) {
  let activeSendFn: ((msg: ServerMessage) => void) | null = null;
  let activeStreamPromise: Promise<void> | null = null;

  function sendToClient(msg: ServerMessage) {
    activeSendFn?.(msg);
  }

  async function consumeAgentStream(stream: AsyncGenerator<SDKMessage>) {
    try {
      for await (const message of stream) {
        if (message.type === "assistant") {
          const blocks = message.message.content as Array<{
            type: string;
            text?: string;
            [key: string]: unknown;
          }>;
          const hasText = blocks.some((b) => b.type === "text" && b.text);
          const hasToolUse = blocks.some((b) => b.type === "tool_use");

          for (const block of blocks) {
            if (block.type === "text" && block.text) {
              sendToClient({
                type: "assistant_text",
                text: block.text,
                messageId: crypto.randomUUID(),
              });
            }
          }

          if (hasText && !hasToolUse) {
            sendToClient({ type: "agent_thinking", thinking: false });
          }
        } else if (message.type === "result") {
          if (message.subtype !== "success") {
            app.log.error(
              { result: message },
              "Agent session ended with error"
            );
            if ("errors" in message) {
              sendToClient({
                type: "error",
                message: `Agent error: ${(message.errors as string[]).join(
                  ", "
                )}`,
              });
            }
          }
          sendToClient({ type: "agent_thinking", thinking: false });
        }
      }
    } catch (err) {
      app.log.error(err, "Error in agent stream");
      sendToClient({ type: "error", message: "Agent stream error" });
    }
  }

  app.get("/ws", { websocket: true }, (socket, _req) => {
    app.log.info("Client connected");

    function localSend(msg: ServerMessage) {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify(msg));
      }
    }

    activeSendFn = localSend;

    socket.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as ClientMessage;
        handleMessage(msg).catch((err) => {
          app.log.error(err, "Error handling message");
          localSend({ type: "error", message: String(err) });
        });
      } catch (err) {
        app.log.error(err, "Failed to parse message");
        localSend({ type: "error", message: "Invalid message format" });
      }
    });

    socket.on("close", () => {
      app.log.info("Client disconnected");
      if (activeSendFn === localSend) {
        activeSendFn = null;
      }
    });

    async function handleMessage(msg: ClientMessage) {
      switch (msg.type) {
        case "reconnect": {
          const session = getActiveSession();
          if (session) {
            app.log.info("Session restored after reconnect");
            localSend({
              type: "session_started",
              sessionId: "reconnected",
            });
          } else {
            localSend({
              type: "session_ended",
              summary: "Session expired. Start a new one.",
            });
          }
          break;
        }

        case "new_session": {
          if (getActiveSession()) {
            cancelIdleTimer();
            endAgentSession();
          }

          resetProcessedMessageCount();
          const session = await startAgentSession(msg.lang);

          localSend({
            type: "session_started",
            sessionId: crypto.randomUUID(),
          });

          activeStreamPromise = consumeAgentStream(session.messageStream());

          sendToClient({ type: "agent_thinking", thinking: true });
          session.sendMessage(
            `The user wants to start a new session for learning this language. If this is a brand new language (no existing files), interview them to assess their level. Otherwise, ask them what kind of session they'd like (practice, conversation, or learning) — just ask in the chat, don't use any special tools.

CRITICAL REMINDER: Wrap target-language phrases you are SPEAKING in <tl></tl> tags so they become clickable. Example: "<tl>¡Hola!</tl> Have you studied Spanish?" Do NOT tag individual vocab words mentioned in English discussion, and do NOT tag proper nouns like names.`
          );

          break;
        }

        case "chat": {
          const session = getActiveSession();
          if (!session) {
            localSend({
              type: "error",
              message: "No active session. Start a new session first.",
            });
            return;
          }

          sendToClient({ type: "agent_thinking", thinking: true });
          session.sendMessage(msg.text);
          break;
        }

        case "end_session": {
          cancelIdleTimer();
          const session = getActiveSession();

          if (msg.discard || !session) {
            endAgentSession();
            activeStreamPromise = null;
            localSend({
              type: "session_ended",
              summary: "Session discarded.",
            });
          } else {
            sendToClient({ type: "agent_thinking", thinking: true });
            session.sendMessage(
              "The user has ended the session. Please wrap up: summarize what was covered, suggest any file changes (items to move between current/review/learned), and update the session log file. After you're done, the session will be committed."
            );

            if (activeStreamPromise) {
              activeStreamPromise.then(async () => {
                try {
                  if (await hasChanges()) {
                    const lang = getActiveLang() ?? "unknown";
                    const today = new Date().toISOString().slice(0, 10);
                    await commitAndPush(`Session completed: ${lang} ${today}`);
                    app.log.info("Session data committed and pushed");
                  }
                } catch (err) {
                  app.log.error(err, "Failed to commit session data");
                }
                endAgentSession();
                activeStreamPromise = null;
                sendToClient({
                  type: "session_ended",
                  summary: "Session completed and saved.",
                });
              });
            }
          }
          break;
        }

        default:
          localSend({
            type: "error",
            message: `Unhandled message type: ${(msg as ClientMessage).type}`,
          });
      }
    }
  });
}
