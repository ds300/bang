import WebSocket from "ws";

const ws = new WebSocket("ws://localhost:3001/ws");

ws.on("open", () => {
  console.log("Connected");
  ws.send(JSON.stringify({ type: "new_session", lang: "es" }));
});

ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  console.log(
    `[${msg.type}]`,
    msg.type === "assistant_text" ? msg.text : JSON.stringify(msg)
  );
});

ws.on("error", (err) => {
  console.error("WS Error:", err.message);
});

ws.on("close", () => {
  console.log("Disconnected");
});

setTimeout(() => {
  console.log("\n--- Timeout, closing ---");
  ws.close();
  process.exit(0);
}, 120000);
