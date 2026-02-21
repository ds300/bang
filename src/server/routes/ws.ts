import type { FastifyInstance } from "fastify";
import type { ClientMessage, ServerMessage } from "../../shared/protocol.js";

export async function wsRoute(app: FastifyInstance) {
  app.get("/ws", { websocket: true }, (socket, _req) => {
    console.log("Client connected");

    function send(msg: ServerMessage) {
      socket.send(JSON.stringify(msg));
    }

    socket.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as ClientMessage;
        handleMessage(msg, send);
      } catch (err) {
        console.error("Failed to parse message:", err);
        send({ type: "error", message: "Invalid message format" });
      }
    });

    socket.on("close", () => {
      console.log("Client disconnected");
    });
  });
}

function handleMessage(
  msg: ClientMessage,
  send: (msg: ServerMessage) => void,
) {
  switch (msg.type) {
    case "chat":
      send({
        type: "assistant_text",
        text: `Echo: ${msg.text}`,
        messageId: crypto.randomUUID(),
      });
      break;
    case "new_session":
      send({
        type: "session_started",
        sessionId: crypto.randomUUID(),
      });
      break;
    default:
      send({ type: "error", message: `Unhandled message type: ${msg.type}` });
  }
}
