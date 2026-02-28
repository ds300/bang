import { DurableObject } from "cloudflare:workers";
import { nanoid } from "nanoid";
import { initSchema } from "./db/schema";
import { buildSystemPrompt } from "./agent/prompts";
import { getTools } from "./agent/tools";
import { runAgentTurn } from "./agent/harness";
import type { ClientMessage, ServerMessage } from "../shared/protocol";
import type { ChatMessage } from "../shared/types";
import type Anthropic from "@anthropic-ai/sdk";

export interface Env {
  TUTOR: DurableObjectNamespace;
  AUTH_KV: KVNamespace;
  ANTHROPIC_API_KEY: string;
  AUTH_SECRET: string;
}

export class TutorDO extends DurableObject<Env> {
  private sql: SqlStorage;
  private initialized = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
  }

  private ensureSchema(): void {
    if (this.initialized) return;
    initSchema(this.sql);
    this.initialized = true;
  }

  async fetch(request: Request): Promise<Response> {
    this.ensureSchema();

    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);

      this.ctx.waitUntil(this.sendInitialState(server));

      return new Response(null, { status: 101, webSocket: client });
    }

    // Handle HTTP requests to the DO
    const url = new URL(request.url);
    if (url.pathname === "/debug") {
      return this.handleDebug(request);
    }
    if (url.pathname === "/sessions" && request.method === "GET") {
      return this.handleSessionsList();
    }
    const sessionsMessagesMatch = /^\/sessions\/([^/]+)\/messages$/.exec(url.pathname);
    if (sessionsMessagesMatch && request.method === "GET") {
      return this.handleSessionMessages(sessionsMessagesMatch[1]);
    }

    return new Response("Not found", { status: 404 });
  }

  private handleSessionsList(): Response {
    const rows = [
      ...this.sql.exec(
        "SELECT id, lang, type, status, started_at, ended_at FROM sessions ORDER BY started_at DESC LIMIT 20",
      ),
    ];
    return Response.json({
      sessions: rows.map((r) => ({
        id: (r as Record<string, unknown>).id,
        lang: (r as Record<string, unknown>).lang,
        type: (r as Record<string, unknown>).type,
        status: (r as Record<string, unknown>).status,
        started_at: (r as Record<string, unknown>).started_at,
        ended_at: (r as Record<string, unknown>).ended_at,
      })),
    });
  }

  private handleSessionMessages(sessionId: string): Response {
    const sessionRow = [
      ...this.sql.exec("SELECT id, lang, started_at, ended_at FROM sessions WHERE id = ?", sessionId),
    ][0] as Record<string, unknown> | undefined;
    if (!sessionRow) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }
    const messages = this.getSessionMessages(sessionId);
    return Response.json({
      session: { id: sessionRow.id, lang: sessionRow.lang, started_at: sessionRow.started_at, ended_at: sessionRow.ended_at },
      messages,
    });
  }

  private async sendInitialState(ws: WebSocket): Promise<void> {
    // Small delay to ensure the WebSocket is ready
    await new Promise((r) => setTimeout(r, 50));
    const state = this.getCurrentState();
    this.wsSend(ws, state);
  }

  private getCurrentState(): ServerMessage {
    const activeSession = this.getActiveSession();
    let messages: ChatMessage[] = [];
    let lang: string | null = null;

    if (activeSession) {
      messages = this.getSessionMessages(activeSession.id as string);
      lang = activeSession.lang as string;
    }

    const langProfile = lang
      ? [...this.sql.exec("SELECT onboarded FROM lang_profile WHERE lang = ?", lang)][0] as { onboarded: number } | undefined
      : undefined;

    return {
      type: "state",
      messages,
      sessionActive: !!activeSession,
      sessionId: activeSession ? (activeSession.id as string) : null,
      lang,
      onboarded: (langProfile?.onboarded ?? 0) === 1,
    };
  }

  private isOnboarded(lang: string): boolean {
    const row = [...this.sql.exec("SELECT onboarded FROM lang_profile WHERE lang = ?", lang)][0] as { onboarded: number } | undefined;
    return (row?.onboarded ?? 0) === 1;
  }

  private getActiveSession(): Record<string, unknown> | null {
    const rows = [
      ...this.sql.exec(
        "SELECT * FROM sessions WHERE status = 'active' ORDER BY started_at DESC LIMIT 1",
      ),
    ];
    return (rows[0] as Record<string, unknown>) ?? null;
  }

  private getSessionMessages(sessionId: string): ChatMessage[] {
    const rows = [
      ...this.sql.exec(
        "SELECT role, content, message_id FROM messages WHERE session_id = ? ORDER BY created_at ASC",
        sessionId,
      ),
    ];
    return rows.map((r) => ({
      id: r.message_id as string,
      role: r.role as "user" | "assistant",
      text: r.content as string,
    }));
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    this.ensureSchema();

    if (typeof message !== "string") return;

    let msg: ClientMessage;
    try {
      msg = JSON.parse(message);
    } catch {
      this.wsSend(ws, { type: "error", message: "Invalid JSON" });
      return;
    }

    switch (msg.type) {
      case "new_session":
        await this.handleNewSession(ws, msg.lang);
        break;
      case "resume_session":
        await this.handleResumeSession(ws, msg.sessionId);
        break;
      case "chat":
        await this.handleChat(ws, msg.text);
        break;
      case "end_session":
        await this.handleEndSession(ws, msg.discard);
        break;
      case "get_state":
        this.wsSend(ws, this.getCurrentState());
        break;
    }
  }

  async webSocketClose(): Promise<void> {}

  async webSocketError(): Promise<void> {}

  private async handleNewSession(
    ws: WebSocket,
    lang: string,
  ): Promise<void> {
    // End any active session first
    this.sql.exec(
      "UPDATE sessions SET status = 'completed', ended_at = datetime('now') WHERE status = 'active'",
    );

    const sessionId = nanoid();
    this.sql.exec(
      "INSERT INTO sessions (id, lang, type, status, started_at) VALUES (?, ?, 'practice', 'active', datetime('now'))",
      sessionId,
      lang,
    );

    this.wsSend(ws, { type: "session_started", sessionId });
    this.wsSend(ws, { type: "agent_thinking", thinking: true });

    try {
      const initialMessage: Anthropic.MessageParam = {
        role: "user",
        content: "Start a new session.",
      };
      const responseText = await this.runAgent(sessionId, lang, [initialMessage]);
      const messageId = crypto.randomUUID();

      this.sql.exec(
        "INSERT INTO messages (session_id, role, content, message_id) VALUES (?, 'assistant', ?, ?)",
        sessionId,
        responseText,
        messageId,
      );

      this.wsSend(ws, { type: "agent_thinking", thinking: false });
      this.wsSend(ws, {
        type: "assistant_message",
        text: responseText,
        messageId,
        onboarded: this.isOnboarded(lang),
      });
    } catch (err) {
      this.wsSend(ws, { type: "agent_thinking", thinking: false });
      this.wsSend(ws, {
        type: "error",
        message: `Agent error: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
    }
  }

  private async handleResumeSession(ws: WebSocket, sessionId: string): Promise<void> {
    const row = [
      ...this.sql.exec("SELECT id, lang, status FROM sessions WHERE id = ?", sessionId),
    ][0] as Record<string, unknown> | undefined;
    if (!row) {
      this.wsSend(ws, { type: "error", message: "Session not found" });
      return;
    }

    this.sql.exec(
      "UPDATE sessions SET status = 'completed', ended_at = datetime('now') WHERE status = 'active'",
    );
    this.sql.exec(
      "UPDATE sessions SET status = 'active', ended_at = NULL WHERE id = ?",
      sessionId,
    );

    this.wsSend(ws, this.getCurrentState());
  }

  private async handleChat(ws: WebSocket, text: string): Promise<void> {
    const session = this.getActiveSession();
    if (!session) {
      this.wsSend(ws, { type: "error", message: "No active session" });
      return;
    }

    const sessionId = session.id as string;
    const lang = session.lang as string;
    const userMessageId = crypto.randomUUID();

    this.sql.exec(
      "INSERT INTO messages (session_id, role, content, message_id) VALUES (?, 'user', ?, ?)",
      sessionId,
      text,
      userMessageId,
    );

    this.wsSend(ws, { type: "user_message_ack", messageId: userMessageId });
    this.wsSend(ws, { type: "agent_thinking", thinking: true });

    try {
      const existingMessages = this.getSessionMessages(sessionId);
      const apiMessages = this.buildApiMessages(existingMessages);

      const responseText = await this.runAgent(sessionId, lang, apiMessages);
      const messageId = crypto.randomUUID();

      this.sql.exec(
        "INSERT INTO messages (session_id, role, content, message_id) VALUES (?, 'assistant', ?, ?)",
        sessionId,
        responseText,
        messageId,
      );

      this.wsSend(ws, { type: "agent_thinking", thinking: false });
      this.wsSend(ws, {
        type: "assistant_message",
        text: responseText,
        messageId,
        onboarded: this.isOnboarded(lang),
      });
    } catch (err) {
      this.wsSend(ws, { type: "agent_thinking", thinking: false });
      this.wsSend(ws, {
        type: "error",
        message: `Agent error: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
    }
  }

  private async handleEndSession(
    ws: WebSocket,
    discard?: boolean,
  ): Promise<void> {
    const status = discard ? "cancelled" : "completed";
    this.sql.exec(
      "UPDATE sessions SET status = ?, ended_at = datetime('now') WHERE status = 'active'",
      status,
    );
    this.wsSend(ws, { type: "session_ended" });
  }

  private handleDebug(request: Request): Response {
    const url = new URL(request.url);
    const action = url.searchParams.get("action") ?? "overview";

    switch (action) {
      case "overview": {
        const sessions = [...this.sql.exec("SELECT id, lang, status, started_at, ended_at FROM sessions ORDER BY started_at DESC")];
        const profile = [...this.sql.exec("SELECT * FROM user_profile")];
        const langProfile = [...this.sql.exec("SELECT * FROM lang_profile")];
        const conceptCounts = [...this.sql.exec("SELECT state, COUNT(*) as cnt FROM concepts GROUP BY state")];
        const upcomingConceptCount = [...this.sql.exec("SELECT COUNT(*) as cnt FROM concepts_upcoming")][0] as { cnt: number } | undefined;
        const eventCount = [...this.sql.exec("SELECT COUNT(*) as cnt FROM events")][0] as { cnt: number } | undefined;
        return Response.json({ sessions, profile, langProfile, conceptCounts, upcomingConceptCount: upcomingConceptCount?.cnt ?? 0, eventCount: eventCount?.cnt ?? 0 });
      }
      case "tables": {
        const tables = [...this.sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")];
        return Response.json({ tables: tables.map((t) => (t as { name: string }).name) });
      }
      case "query": {
        const table = url.searchParams.get("table");
        const limit = parseInt(url.searchParams.get("limit") ?? "50");
        const offset = parseInt(url.searchParams.get("offset") ?? "0");
        if (!table) return Response.json({ error: "table required" }, { status: 400 });
        // Prevent SQL injection by whitelist-checking the table name
        const validTables = ["events", "user_profile", "lang_profile", "concepts", "concepts_upcoming", "vocab", "lessons_upcoming", "sessions", "messages", "agent_actions"];
        if (!validTables.includes(table)) return Response.json({ error: "Invalid table" }, { status: 400 });
        const rows = [...this.sql.exec(`SELECT * FROM ${table} ORDER BY rowid DESC LIMIT ? OFFSET ?`, limit, offset)];
        const total = [...this.sql.exec(`SELECT COUNT(*) as cnt FROM ${table}`)][0] as { cnt: number } | undefined;
        return Response.json({ rows, total: total?.cnt ?? 0 });
      }
      case "agent_actions": {
        const sessionId = url.searchParams.get("session_id");
        const limit = parseInt(url.searchParams.get("limit") ?? "100");
        let rows;
        if (sessionId) {
          rows = [...this.sql.exec("SELECT * FROM agent_actions WHERE session_id = ? ORDER BY id DESC LIMIT ?", sessionId, limit)];
        } else {
          rows = [...this.sql.exec("SELECT * FROM agent_actions ORDER BY id DESC LIMIT ?", limit)];
        }
        return Response.json({ actions: rows });
      }
      case "events": {
        const limit = parseInt(url.searchParams.get("limit") ?? "50");
        const type = url.searchParams.get("type");
        let rows;
        if (type) {
          rows = [...this.sql.exec("SELECT * FROM events WHERE type = ? ORDER BY id DESC LIMIT ?", type, limit)];
        } else {
          rows = [...this.sql.exec("SELECT * FROM events ORDER BY id DESC LIMIT ?", limit)];
        }
        return Response.json({ events: rows });
      }
      case "context": {
        const lang = url.searchParams.get("lang") ?? "es";
        const activeSession = this.getActiveSession();
        const ctx = this.getAgentContext(lang, activeSession?.id as string);
        const systemPrompt = buildSystemPrompt(ctx);
        return Response.json({ context: ctx, systemPrompt });
      }
      case "snapshot": {
        const activeSession = this.getActiveSession();
        if (!activeSession) {
          return Response.json({ error: "No active session" }, { status: 400 });
        }
        const sessionId = activeSession.id as string;
        const lang = activeSession.lang as string;
        const ctx = this.getAgentContext(lang, sessionId);
        const allMessages = this.getSessionMessages(sessionId);

        const dropLastN = parseInt(url.searchParams.get("drop_last") ?? "1");
        const trimmed = allMessages.slice(0, Math.max(0, allMessages.length - dropLastN));

        const apiMessages = trimmed.map((m) => ({
          role: m.role,
          content: m.text,
        }));

        const scenario = {
          name: "TODO: name this scenario",
          tags: ["TODO"],
          description: "TODO: describe what this scenario tests",
          context: ctx,
          messages: apiMessages,
          rubric: [
            { description: "TODO: add rubric items", critical: true },
          ],
        };

        const ts = this.formatScenarioAsTypeScript(scenario);
        return Response.json({ scenario, typescript: ts });
      }
      default:
        return Response.json({ error: "Unknown action" }, { status: 400 });
    }
  }

  private buildApiMessages(
    messages: ChatMessage[],
  ): Anthropic.MessageParam[] {
    return messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.text,
    }));
  }

  private async runAgent(
    sessionId: string,
    lang: string,
    apiMessages: Anthropic.MessageParam[],
  ): Promise<string> {
    const userId = this.ctx.id.toString();
    const ctx = this.getAgentContext(lang, sessionId);
    const systemPrompt = buildSystemPrompt(ctx);
    const tools = getTools({ includeProfileTools: !ctx.onboarded });

    const ws = this.ctx.getWebSockets()[0];
    const onStep = (step: unknown) => {
      if (ws) {
        this.wsSend(ws, { type: "agent_step", step } as ServerMessage);
      }
    };

    const logAction = (type: string, data: unknown) => {
      this.sql.exec(
        "INSERT INTO agent_actions (session_id, type, data) VALUES (?, ?, ?)",
        sessionId,
        type,
        JSON.stringify(data),
      );
    };

    return runAgentTurn({
      apiKey: this.env.ANTHROPIC_API_KEY,
      systemPrompt,
      messages: apiMessages,
      tools,
      toolContext: {
        sql: this.sql,
        sessionId,
        userId,
        lang,
      },
      onStep,
      logAction,
    });
  }

  private getAgentContext(lang: string, sessionId?: string) {
    const profile = [
      ...this.sql.exec("SELECT * FROM user_profile LIMIT 1"),
    ][0] as Record<string, unknown> | undefined;

    const langProfile = [
      ...this.sql.exec("SELECT * FROM lang_profile WHERE lang = ?", lang),
    ][0] as Record<string, unknown> | undefined;

    const introducingConcepts = [
      ...this.sql.exec(
        "SELECT id, name, tags, notes FROM concepts WHERE lang = ? AND state = 'introducing'",
        lang,
      ),
    ] as Array<{ id: number; name: string; tags: string; notes: string | null }>;

    const reviewDue = [
      ...this.sql.exec(
        "SELECT id, name, tags FROM concepts WHERE lang = ? AND state = 'reinforcing' AND (sm2_next_review IS NULL OR sm2_next_review <= datetime('now'))",
        lang,
      ),
    ] as Array<{ id: number; name: string; tags: string }>;

    const reinforcingCount = [
      ...this.sql.exec(
        "SELECT COUNT(*) as cnt FROM concepts WHERE lang = ? AND state = 'reinforcing'",
        lang,
      ),
    ][0] as { cnt: number } | undefined;

    const recentExerciseResults = [
      ...this.sql.exec(
        `SELECT e.data, e.created_at FROM events e
         WHERE e.type = 'exercise_result' AND e.lang = ?
         ORDER BY e.id DESC LIMIT 20`,
        lang,
      ),
    ].map((row) => {
      const r = row as { data: string; created_at: string };
      const data = JSON.parse(r.data);
      const concept = [...this.sql.exec(
        "SELECT name FROM concepts WHERE id = ?",
        data.concept_id,
      )][0] as { name: string } | undefined;
      return {
        concept_name: concept?.name ?? `concept#${data.concept_id}`,
        quality: data.quality,
        exercise_type: data.exercise_type,
        created_at: r.created_at,
      };
    });

    const upcomingConcepts = [
      ...this.sql.exec(
        "SELECT id, name, type, priority, source FROM concepts_upcoming WHERE lang = ? ORDER BY CASE priority WHEN 'next' THEN 1 WHEN 'soon' THEN 2 ELSE 3 END, id ASC LIMIT 15",
        lang,
      ),
    ] as Array<{ id: number; name: string; type: string; priority: string; source: string }>;

    const upcomingLessons = [
      ...this.sql.exec(
        "SELECT id, type, title, description, status FROM lessons_upcoming WHERE lang = ? AND status IN ('planned', 'active') ORDER BY seq ASC LIMIT 5",
        lang,
      ),
    ] as Array<{ id: number; type: string; title: string; description: string; status: string }>;

    let sessionType: string | null = null;
    let sessionLessonDescription: string | null = null;
    if (sessionId) {
      const session = [...this.sql.exec(
        "SELECT type, plan_id FROM sessions WHERE id = ?",
        sessionId,
      )][0] as { type: string; plan_id: number | null } | undefined;
      if (session) {
        sessionType = session.type;
        if (session.plan_id) {
          const plan = [...this.sql.exec(
            "SELECT description FROM lessons_upcoming WHERE id = ?",
            session.plan_id,
          )][0] as { description: string } | undefined;
          sessionLessonDescription = plan?.description ?? null;
        }
      }
    }

    return {
      nativeLang: (profile?.native_lang as string) ?? "en",
      targetLang: lang,
      cefrLevel: (langProfile?.cefr_level as string) ?? null,
      onboarded: (langProfile?.onboarded as number) === 1,
      introducingConcepts,
      reviewDueConcepts: reviewDue,
      reinforcingCount: (reinforcingCount?.cnt as number) ?? 0,
      recentExerciseResults,
      upcomingConcepts,
      upcomingLessons,
      sessionType,
      sessionLessonDescription,
    };
  }

  private formatScenarioAsTypeScript(scenario: Record<string, unknown>): string {
    const ctx = scenario.context as Record<string, unknown>;
    const messages = scenario.messages as Array<{ role: string; content: string }>;
    const rubric = scenario.rubric as Array<{ description: string; critical: boolean }>;

    const indent = (s: string, n: number) => s.split("\n").map((l, i) => i === 0 ? l : " ".repeat(n) + l).join("\n");

    let ts = `  {\n`;
    ts += `    name: ${JSON.stringify(scenario.name)},\n`;
    ts += `    tags: ${JSON.stringify(scenario.tags)},\n`;
    ts += `    description: ${JSON.stringify(scenario.description)},\n`;
    ts += `    context: ${indent(JSON.stringify(ctx, null, 2), 4)},\n`;
    ts += `    messages: [\n`;
    for (const m of messages) {
      const content = JSON.stringify(m.content);
      ts += `      { role: ${JSON.stringify(m.role)}, content: ${content} },\n`;
    }
    ts += `    ],\n`;
    ts += `    rubric: [\n`;
    for (const r of rubric) {
      ts += `      { description: ${JSON.stringify(r.description)}, critical: ${r.critical} },\n`;
    }
    ts += `    ],\n`;
    ts += `  }`;
    return ts;
  }

  private wsSend(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // WebSocket may have closed
    }
  }
}
