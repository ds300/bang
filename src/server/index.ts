import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { config } from "dotenv";
import { wsRoute } from "./routes/ws.js";
import { breakdownRoutes } from "./routes/breakdown.js";

config();

const PORT = parseInt(process.env.PORT || "3001", 10);

async function main() {
  const app = Fastify({ logger: true });

  await app.register(websocket);
  await app.register(wsRoute);
  await app.register(breakdownRoutes);

  app.get("/api/health", async () => ({ status: "ok" }));

  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`Bang server listening on port ${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
