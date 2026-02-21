import type { FastifyInstance } from "fastify";
import type { ClientMessage, ServerMessage } from "../../shared/protocol.js";
import {
  startAgentSession,
  endAgentSession,
  resolveToolCall,
} from "../agent/session.js";

export async function wsRoute(app: FastifyInstance) {
  app.get("/ws", { websocket: true }, (socket, _req) => {
    app.log.info("Client connected");

    let isStreaming = false;

    function send(msg: ServerMessage) {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify(msg));
      }
    }

    socket.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as ClientMessage;
        handleMessage(msg, send, app).catch((err) => {
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
      endAgentSession();
    });

    async function handleMessage(
      msg: ClientMessage,
      send: (msg: ServerMessage) => void,
      app: FastifyInstance,
    ) {
      switch (msg.type) {
        case "new_session": {
          const session = await startAgentSession(msg.lang, send);
          send({
            type: "session_started",
            sessionId: crypto.randomUUID(),
          });

          const greeting = `The user wants to start a new session for learning this language. If this is a brand new language (no existing files), interview them to assess their level. Otherwise, present session type options using the present_options tool.`;

          await session.send(greeting);
          send({ type: "agent_thinking", thinking: true });

          try {
            await streamAgentResponse(session, send, app);
          } finally {
            send({ type: "agent_thinking", thinking: false });
          }
          break;
        }

        case "chat": {
          const session = await getCurrentSession(send);
          if (!session) return;

          await session.send(msg.text);
          send({ type: "agent_thinking", thinking: true });

          try {
            await streamAgentResponse(session, send, app);
          } finally {
            send({ type: "agent_thinking", thinking: false });
          }
          break;
        }

        case "tool_response": {
          resolveToolCall(msg.toolCallId, msg.data);
          break;
        }

        case "end_session": {
          if (msg.discard) {
            endAgentSession();
            send({
              type: "session_ended",
              summary: "Session discarded.",
            });
          } else {
            const session = await getCurrentSession(send);
            if (!session) return;

            await session.send(
              "The user has ended the session. Please wrap up: summarize what was covered, suggest any file changes (items to move between current/review/learned), and update the session log file.",
            );
            send({ type: "agent_thinking", thinking: true });

            try {
              await streamAgentResponse(session, send, app);
            } finally {
              send({ type: "agent_thinking", thinking: false });
              endAgentSession();
              send({
                type: "session_ended",
                summary: "Session completed.",
              });
            }
          }
          break;
        }

        case "request_breakdown": {
          // TODO: implement on-demand sentence breakdown (Phase 6)
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

    async function getCurrentSession(send: (msg: ServerMessage) => void) {
      const { getActiveSession } = await import("../agent/session.js");
      const session = getActiveSession();
      if (!session) {
        send({
          type: "error",
          message: "No active session. Start a new session first.",
        });
        return null;
      }
      return session;
    }

    async function streamAgentResponse(
      session: { stream: () => AsyncGenerator<import("@anthropic-ai/claude-agent-sdk").SDKMessage> },
      send: (msg: ServerMessage) => void,
      app: FastifyInstance,
    ) {
      if (isStreaming) return;
      isStreaming = true;

      try {
        let currentMessageId = crypto.randomUUID();

        for await (const message of session.stream()) {
          if (message.type === "assistant") {
            const textBlocks = message.message.content.filter(
              (block: { type: string }) => block.type === "text",
            );
            for (const block of textBlocks) {
              if ("text" in block && block.text) {
                send({
                  type: "assistant_text",
                  text: block.text as string,
                  messageId: currentMessageId,
                });
                currentMessageId = crypto.randomUUID();
              }
            }
          } else if (message.type === "result") {
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
      } finally {
        isStreaming = false;
      }
    }
  });
}
