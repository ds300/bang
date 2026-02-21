import type { FastifyInstance } from "fastify";
import type { ClientMessage, ServerMessage } from "../../shared/protocol.js";
import {
  startAgentSession,
  endAgentSession,
  resolveToolCall,
  getActiveSession,
  getActiveLang,
} from "../agent/session.js";
import {
  resetIdleTimer,
  cancelIdleTimer,
  resetProcessedMessageCount,
} from "../services/idle-processor.js";
import { commitAndPush, hasChanges } from "../services/git.js";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

export async function wsRoute(app: FastifyInstance) {
  app.get("/ws", { websocket: true }, (socket, _req) => {
    app.log.info("Client connected");

    let streamingPromise: Promise<void> | null = null;

    function send(msg: ServerMessage) {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify(msg));
      }
    }

    socket.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as ClientMessage;
        handleMessage(msg).catch((err) => {
          app.log.error(err, "Error handling message");
          send({ type: "error", message: String(err) });
        });
      } catch (err) {
        app.log.error(err, "Failed to parse message");
        send({ type: "error", message: "Invalid message format" });
      }
    });

    socket.on("close", () => {
      app.log.info("Client disconnected");
      cancelIdleTimer();
      endAgentSession();
    });

    async function handleMessage(msg: ClientMessage) {
      switch (msg.type) {
        case "new_session": {
          // End previous session if active
          if (getActiveSession()) {
            cancelIdleTimer();
            endAgentSession();
          }

          resetProcessedMessageCount();
          const session = await startAgentSession(msg.lang, send);

          send({
            type: "session_started",
            sessionId: crypto.randomUUID(),
          });

          streamingPromise = consumeAgentStream(session.messageStream());

          const greeting = `The user wants to start a new session for learning this language. If this is a brand new language (no existing files), interview them to assess their level. Otherwise, present session type options using the present_options tool. YOU MUST use the present_options tool to present options — do not type them out as text.`;
          session.sendMessage(greeting);

          break;
        }

        case "chat": {
          const session = getActiveSession();
          if (!session) {
            send({
              type: "error",
              message: "No active session. Start a new session first.",
            });
            return;
          }

          // Reset idle timer on each user message
          resetIdleTimer(async () => {
            app.log.info("Idle timeout — processing session data");
          });

          session.sendMessage(msg.text);
          break;
        }

        case "tool_response": {
          resolveToolCall(msg.toolCallId, msg.data);
          break;
        }

        case "end_session": {
          cancelIdleTimer();
          const session = getActiveSession();

          if (msg.discard || !session) {
            endAgentSession();
            send({
              type: "session_ended",
              summary: "Session discarded.",
            });
          } else {
            session.sendMessage(
              "The user has ended the session. Please wrap up: summarize what was covered, suggest any file changes (items to move between current/review/learned), and update the session log file. After you're done, the session will be committed.",
            );

            // Wait for the stream to finish, then commit
            if (streamingPromise) {
              streamingPromise.then(async () => {
                try {
                  if (await hasChanges()) {
                    const lang = getActiveLang() ?? "unknown";
                    const today = new Date().toISOString().slice(0, 10);
                    await commitAndPush(
                      `Session completed: ${lang} ${today}`,
                    );
                    app.log.info("Session data committed and pushed");
                  }
                } catch (err) {
                  app.log.error(err, "Failed to commit session data");
                }
                endAgentSession();
                send({
                  type: "session_ended",
                  summary: "Session completed and saved.",
                });
              });
            }
          }
          break;
        }

        case "request_breakdown": {
          send({
            type: "error",
            message: "Sentence breakdown not yet implemented",
          });
          break;
        }

        default:
          send({
            type: "error",
            message: `Unhandled message type: ${(msg as ClientMessage).type}`,
          });
      }
    }

    async function consumeAgentStream(stream: AsyncGenerator<SDKMessage>) {
      try {
        let thinkingSent = false;

        for await (const message of stream) {
          if (message.type === "assistant") {
            if (thinkingSent) {
              send({ type: "agent_thinking", thinking: false });
              thinkingSent = false;
            }

            const textBlocks = message.message.content.filter(
              (block: { type: string }) => block.type === "text",
            );
            const toolUseBlocks = message.message.content.filter(
              (block: { type: string }) => block.type === "tool_use",
            );

            for (const block of textBlocks) {
              if ("text" in block && block.text) {
                send({
                  type: "assistant_text",
                  text: block.text as string,
                  messageId: crypto.randomUUID(),
                });
              }
            }

            if (toolUseBlocks.length > 0 && textBlocks.length === 0) {
              if (!thinkingSent) {
                send({ type: "agent_thinking", thinking: true });
                thinkingSent = true;
              }
            }
          } else if (message.type === "result") {
            if (thinkingSent) {
              send({ type: "agent_thinking", thinking: false });
            }
            if (message.subtype !== "success") {
              app.log.error(
                { result: message },
                "Agent session ended with error",
              );
              if ("errors" in message) {
                send({
                  type: "error",
                  message: `Agent error: ${(message.errors as string[]).join(", ")}`,
                });
              }
            }
          }
        }
      } catch (err) {
        app.log.error(err, "Error in agent stream");
        send({ type: "error", message: "Agent stream error" });
      }
    }
  });
}
