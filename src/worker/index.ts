import { handleSignup, handleLogin, extractDoId } from "./auth";
import { handleTranslate } from "./routes/translate";
import { handleBreakdown, handleBreakdownAsk } from "./routes/breakdown";
import { handlePromptTestGet, handlePromptTestPost } from "./routes/prompt-test";
import { handleGeneratePlacementText } from "./routes/placement-text";

export { TutorDO } from "./tutor-do";

export interface Env {
  TUTOR: DurableObjectNamespace;
  AUTH_KV: KVNamespace;
  ANTHROPIC_API_KEY: string;
  AUTH_SECRET: string;
}

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function corsResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders())) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Public auth routes
    if (url.pathname === "/api/signup" && request.method === "POST") {
      return corsResponse(await handleSignup(env));
    }
    if (url.pathname === "/api/login" && request.method === "POST") {
      return corsResponse(await handleLogin(request, env));
    }

    // All other routes require auth
    const doId = await extractDoId(request, env.AUTH_SECRET);
    if (!doId) {
      return corsResponse(
        Response.json({ error: "Unauthorized" }, { status: 401 }),
      );
    }

    // Stateless API routes (handled by worker, not DO)
    if (url.pathname === "/api/translate" && request.method === "POST") {
      return corsResponse(
        await handleTranslate(request, env.ANTHROPIC_API_KEY),
      );
    }
    if (url.pathname === "/api/breakdown" && request.method === "POST") {
      return corsResponse(
        await handleBreakdown(request, env.ANTHROPIC_API_KEY),
      );
    }
    if (url.pathname === "/api/breakdown/ask" && request.method === "POST") {
      return corsResponse(
        await handleBreakdownAsk(request, env.ANTHROPIC_API_KEY),
      );
    }
    if (url.pathname === "/api/prompt-test" && request.method === "GET") {
      return corsResponse(handlePromptTestGet());
    }
    if (url.pathname === "/api/prompt-test" && request.method === "POST") {
      return corsResponse(
        await handlePromptTestPost(request, env.ANTHROPIC_API_KEY),
      );
    }

    // Routes that go to the Durable Object
    const objId = env.TUTOR.idFromName(doId);
    const stub = env.TUTOR.get(objId);

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      return stub.fetch(request);
    }

    // Debug endpoint -> DO
    if (url.pathname === "/api/debug") {
      const debugUrl = new URL("https://do/debug");
      debugUrl.search = url.search;
      return corsResponse(
        await stub.fetch(new Request(debugUrl.toString())),
      );
    }

    // Sessions list -> DO
    if (url.pathname === "/api/sessions" && request.method === "GET") {
      return corsResponse(
        await stub.fetch(new Request("https://do/sessions")),
      );
    }
    // Create session (e.g. after placement) -> DO
    if (url.pathname === "/api/sessions" && request.method === "POST") {
      const doRequest = new Request("https://do/sessions", {
        method: "POST",
        headers: request.headers,
        body: request.body,
      });
      return corsResponse(await stub.fetch(doRequest));
    }

    // Lang profile (e.g. is lang onboarded?) -> DO
    if (url.pathname === "/api/lang-profile" && request.method === "GET") {
      const doUrl = new URL("https://do/lang-profile");
      doUrl.search = url.search;
      return corsResponse(await stub.fetch(doUrl.toString()));
    }

    // Session messages -> DO
    const sessionMessagesMatch = /^\/api\/sessions\/([^/]+)\/messages$/.exec(url.pathname);
    if (sessionMessagesMatch && request.method === "GET") {
      const sessionId = sessionMessagesMatch[1];
      return corsResponse(
        await stub.fetch(new Request(`https://do/sessions/${sessionId}/messages`)),
      );
    }

    // Placement text generation (stateless, worker)
    if (url.pathname === "/api/placement/generate-text" && request.method === "POST") {
      return corsResponse(
        await handleGeneratePlacementText(request, env.ANTHROPIC_API_KEY),
      );
    }

    // Placement onboarding -> DO
    const placementMatch = /^\/api\/placement(\/.*)?$/.exec(url.pathname);
    if (placementMatch) {
      const path = placementMatch[1] ?? "";
      const doUrl = new URL(`https://do/placement${path}`);
      doUrl.search = url.search;
      const doRequest = new Request(doUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
      });
      return corsResponse(await stub.fetch(doRequest));
    }

    return corsResponse(
      Response.json({ error: "Not found" }, { status: 404 }),
    );
  },
};
