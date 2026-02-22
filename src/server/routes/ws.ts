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
import {
  createSessionRecord,
  deactivateAllSessions,
  getActiveSessionRecord,
  addMessageRecord,
  getSessionMessages,
} from "../services/db.js";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

const TAG_REMINDER = `REMINDER: EVERY word must be inside <tl> or <nl> tags for correct TTS pronunciation. When languages mix mid-sentence, break into alternating tags: <tl>¡Casi!</tl> <nl>"Calor" means "hot"</nl> <tl>— muy bien.</tl>. NEVER leave English words untagged inside <tl> blocks.`;

const TARGET_LANG_INSTRUCTION = `LANGUAGE RULE: You MUST speak to the user in their TARGET language. All instructions, feedback, exercise prompts, and conversational text must be in the target language. The ONLY exceptions are: (1) English sentences the user must translate TO the target language, which go in <nl> tags, (2) the user explicitly asks you to switch to English. Even brief phrases like "correct", "try again", "next exercise" must be in the target language. This is non-negotiable.`;

export async function wsRoute(app: FastifyInstance) {
  let activeSendFn: ((msg: ServerMessage) => void) | null = null;
  let activeStreamPromise: Promise<void> | null = null;
  let currentSessionId: string | null = null;
  let currentTargetLangMode = true;

  function sendToClient(msg: ServerMessage) {
    activeSendFn?.(msg);
  }

  function buildSuffix(): string {
    const parts = [TAG_REMINDER];
    if (currentTargetLangMode) {
      parts.push(TARGET_LANG_INSTRUCTION);
    }
    return "\n\n" + parts.join("\n");
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
              const messageId = crypto.randomUUID();
              sendToClient({
                type: "assistant_text",
                text: block.text,
                messageId,
              });
              if (currentSessionId) {
                addMessageRecord(
                  currentSessionId,
                  "assistant",
                  block.text,
                  messageId
                );
              }
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
          if ("targetLangMode" in msg && msg.targetLangMode !== undefined) {
            currentTargetLangMode = msg.targetLangMode;
          }

          const inMemory = getActiveSession();
          if (inMemory) {
            app.log.info("Session still in memory, reconnecting");
            localSend({
              type: "session_started",
              sessionId: currentSessionId ?? "reconnected",
            });
            break;
          }

          const dbSession = getActiveSessionRecord();
          if (dbSession) {
            app.log.info(
              `Restoring session ${dbSession.id} from DB (lang: ${dbSession.lang})`
            );
            currentSessionId = dbSession.id;
            const messages = getSessionMessages(dbSession.id);
            const history = messages.map((m) => ({
              role: m.role,
              text: m.text,
            }));

            const session = await startAgentSession(dbSession.lang, history);
            activeStreamPromise = consumeAgentStream(session.messageStream());

            localSend({
              type: "session_started",
              sessionId: dbSession.id,
            });
          } else {
            localSend({
              type: "session_ended",
              summary: "No active session.",
            });
          }
          break;
        }

        case "new_session": {
          if (msg.targetLangMode !== undefined) {
            currentTargetLangMode = msg.targetLangMode;
          }

          if (getActiveSession()) {
            cancelIdleTimer();
            endAgentSession();
          }
          deactivateAllSessions();

          const sessionId = crypto.randomUUID();
          currentSessionId = sessionId;
          createSessionRecord(sessionId, msg.lang);

          resetProcessedMessageCount();
          const session = await startAgentSession(msg.lang);

          localSend({
            type: "session_started",
            sessionId,
          });

          activeStreamPromise = consumeAgentStream(session.messageStream());

          sendToClient({ type: "agent_thinking", thinking: true });
          session.sendMessage(
            `The user wants to start a new session for learning this language. If this is a brand new language (no existing files), interview them to assess their level. Otherwise, ask them what kind of session they'd like (practice, conversation, or learning) — just ask in the chat, don't use any special tools.

IMPORTANT: Once the user picks a session type, you MUST create a session log file BEFORE presenting any exercises. Check data/${msg.lang}/sessions/ for today's files, pick the next number, and write the full session plan (all exercises with types, concepts, and question text) to the file. Only then start the session.${buildSuffix()}`
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

          if (msg.targetLangMode !== undefined) {
            currentTargetLangMode = msg.targetLangMode;
          }

          if (currentSessionId) {
            addMessageRecord(
              currentSessionId,
              "user",
              msg.text,
              crypto.randomUUID()
            );
          }

          sendToClient({ type: "agent_thinking", thinking: true });
          session.sendMessage(msg.text + buildSuffix());
          break;
        }

        case "end_session": {
          cancelIdleTimer();
          const session = getActiveSession();

          if (msg.discard || !session) {
            endAgentSession();
            activeStreamPromise = null;
            deactivateAllSessions();
            localSend({
              type: "session_ended",
              summary: "Session discarded.",
            });
          } else {
            sendToClient({ type: "agent_thinking", thinking: true });
            session.sendMessage(
              "The user has ended the session. Please wrap up:\n1. Update the session log file with all exercise results (pass/fail per exercise, user answers, corrections given), items actively/passively tested, and an end-of-session assessment.\n2. Suggest any file changes (items to move between current/review/learned) in the chat and wait for confirmation.\n3. Update plan.md if needed.\nAfter you're done, the session will be committed." + buildSuffix()
            );

            if (activeStreamPromise) {
              activeStreamPromise.then(async () => {
                try {
                  if (await hasChanges()) {
                    const lang = getActiveLang() ?? "unknown";
                    const today = new Date().toISOString().slice(0, 10);
                    await commitAndPush(
                      `Session completed: ${lang} ${today}`
                    );
                    app.log.info("Session data committed and pushed");
                  }
                } catch (err) {
                  app.log.error(err, "Failed to commit session data");
                }
                endAgentSession();
                activeStreamPromise = null;
                deactivateAllSessions();
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
