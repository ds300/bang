import type Anthropic from "@anthropic-ai/sdk";
import { appendEvent } from "../db/events";
import { computeSM2 } from "../db/sm2";
import type { ExerciseQuality } from "../db/sm2";

export type ToolDefinition = Anthropic.Tool;

export function getTools(): ToolDefinition[] {
  return [
    {
      name: "set_profile",
      description:
        "Set or update the user profile. Call during onboarding to record the user's native language and any learning preferences.",
      input_schema: {
        type: "object" as const,
        properties: {
          native_lang: {
            type: "string",
            description: "ISO 639-1 code for native language (e.g. 'en')",
          },
          preferences: {
            type: "object",
            description:
              "User preferences as JSON (e.g. learning style, pace, interests)",
          },
        },
        required: ["native_lang"],
      },
    },
    {
      name: "set_lang_profile",
      description:
        "Set or update the target language profile. Call during onboarding after assessing the student's CEFR level.",
      input_schema: {
        type: "object" as const,
        properties: {
          lang: {
            type: "string",
            description: "ISO 639-1 code for the target language",
          },
          cefr_level: {
            type: "string",
            enum: ["A1", "A2", "B1", "B2", "C1", "C2"],
            description: "Assessed CEFR level",
          },
        },
        required: ["lang", "cefr_level"],
      },
    },
    {
      name: "add_concepts",
      description:
        "Bulk-add concepts the student is learning or already knows. Use during onboarding or when decomposing a topic into concrete concepts.",
      input_schema: {
        type: "object" as const,
        properties: {
          concepts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "Concept or vocabulary name",
                },
                tags: {
                  type: "string",
                  description:
                    'Pipe-separated tags, e.g. "grammar|verbs|irregular"',
                },
                state: {
                  type: "string",
                  enum: ["current", "review", "learned"],
                  description: "Learning state",
                },
                notes: {
                  type: "string",
                  description:
                    "Optional notes about difficulties or context",
                },
              },
              required: ["name", "state"],
            },
          },
          lang: { type: "string", description: "ISO 639-1 language code" },
        },
        required: ["concepts", "lang"],
      },
    },
    {
      name: "update_concept",
      description: "Update a concept's notes or tags.",
      input_schema: {
        type: "object" as const,
        properties: {
          concept_id: { type: "number", description: "Concept ID" },
          notes: { type: "string", description: "Updated notes" },
          tags: { type: "string", description: "Updated pipe-separated tags" },
        },
        required: ["concept_id"],
      },
    },
    {
      name: "move_concept",
      description:
        "Transition a concept between states (current -> review -> learned, or back).",
      input_schema: {
        type: "object" as const,
        properties: {
          concept_id: { type: "number", description: "Concept ID" },
          new_state: {
            type: "string",
            enum: ["current", "review", "learned"],
            description: "New state for the concept",
          },
        },
        required: ["concept_id", "new_state"],
      },
    },
    {
      name: "record_exercise_result",
      description:
        "Record the result of an exercise for a concept. SM-2 scheduling is computed automatically from the quality rating.",
      input_schema: {
        type: "object" as const,
        properties: {
          concept_id: { type: "number", description: "Concept ID tested" },
          quality: {
            type: "string",
            enum: ["fail", "hard", "pass", "easy"],
            description:
              "How well the student performed: fail (didn't know), hard (with difficulty), pass (correct), easy (effortless)",
          },
          exercise_type: {
            type: "string",
            enum: ["listening", "translation", "writing", "spot_error"],
            description: "Type of exercise",
          },
          mode: {
            type: "string",
            enum: ["production", "recognition"],
            description:
              "Whether the student produced the language or recognized it",
          },
        },
        required: ["concept_id", "quality", "exercise_type", "mode"],
      },
    },
    {
      name: "get_learned_concepts",
      description:
        "Query the full list of learned concepts (potentially large, so not baked into prompt).",
      input_schema: {
        type: "object" as const,
        properties: {
          lang: { type: "string", description: "ISO 639-1 language code" },
          limit: {
            type: "number",
            description: "Max results to return (default 50)",
          },
          offset: {
            type: "number",
            description: "Offset for pagination",
          },
        },
        required: ["lang"],
      },
    },
    {
      name: "search_concepts",
      description: "Search concepts by name or tags across all states.",
      input_schema: {
        type: "object" as const,
        properties: {
          lang: { type: "string", description: "ISO 639-1 language code" },
          query: {
            type: "string",
            description: "Search term (matches name and tags)",
          },
        },
        required: ["lang", "query"],
      },
    },
    {
      name: "add_topic",
      description:
        "Add an idea for future learning. Topics are decomposed into concepts when the agent picks them up.",
      input_schema: {
        type: "object" as const,
        properties: {
          lang: { type: "string", description: "ISO 639-1 language code" },
          description: {
            type: "string",
            description: "What the student wants to learn",
          },
          priority: {
            type: "string",
            enum: ["next", "soon", "later"],
            description:
              "Priority: next (front of queue), soon (near-term), later (backlog)",
          },
          source: {
            type: "string",
            description:
              "Where this topic came from (e.g. 'user_request', 'agent_suggestion', 'breakdown')",
          },
        },
        required: ["lang", "description"],
      },
    },
    {
      name: "resolve_topic",
      description:
        "Mark a topic as resolved/decomposed (e.g. after breaking it down into concepts and planning sessions).",
      input_schema: {
        type: "object" as const,
        properties: {
          topic_id: { type: "number", description: "Topic ID to resolve" },
        },
        required: ["topic_id"],
      },
    },
    {
      name: "plan_sessions",
      description:
        "Create one or more planned sessions to sequence learning for a topic or set of concepts.",
      input_schema: {
        type: "object" as const,
        properties: {
          sessions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                lang: { type: "string" },
                type: {
                  type: "string",
                  enum: ["practice", "conversation", "learning"],
                },
                description: {
                  type: "string",
                  description: "What this session will cover",
                },
                topic_ids: {
                  type: "string",
                  description: "Comma-separated topic IDs this session covers",
                },
                concept_ids: {
                  type: "string",
                  description:
                    "Comma-separated concept IDs to focus on",
                },
              },
              required: ["lang", "type", "description"],
            },
          },
        },
        required: ["sessions"],
      },
    },
    {
      name: "update_session",
      description:
        "Update the current session's status, planned exercises, or results.",
      input_schema: {
        type: "object" as const,
        properties: {
          status: {
            type: "string",
            enum: ["active", "completed", "cancelled"],
          },
          planned_exercises: {
            type: "string",
            description: "JSON string of planned exercises",
          },
          results: {
            type: "string",
            description: "JSON string of session results summary",
          },
        },
      },
    },
  ];
}

export interface ToolExecutionContext {
  sql: SqlStorage;
  sessionId: string | null;
  userId: string;
  lang: string;
}

export function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolExecutionContext,
): string {
  const handlers: Record<
    string,
    (input: Record<string, unknown>, ctx: ToolExecutionContext) => string
  > = {
    set_profile: execSetProfile,
    set_lang_profile: execSetLangProfile,
    add_concepts: execAddConcepts,
    update_concept: execUpdateConcept,
    move_concept: execMoveConcept,
    record_exercise_result: execRecordExerciseResult,
    get_learned_concepts: execGetLearnedConcepts,
    search_concepts: execSearchConcepts,
    add_topic: execAddTopic,
    resolve_topic: execResolveTopic,
    plan_sessions: execPlanSessions,
    update_session: execUpdateSession,
  };

  const handler = handlers[name];
  if (!handler) return JSON.stringify({ error: `Unknown tool: ${name}` });

  try {
    return handler(input, ctx);
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : "Tool execution failed",
    });
  }
}

function execSetProfile(
  input: Record<string, unknown>,
  ctx: ToolExecutionContext,
): string {
  const now = new Date().toISOString();
  const nativeLang = input.native_lang as string;
  const preferences = input.preferences
    ? JSON.stringify(input.preferences)
    : null;

  const existing = [...ctx.sql.exec("SELECT id FROM user_profile WHERE id = ?", ctx.userId)];

  if (existing.length > 0) {
    ctx.sql.exec(
      "UPDATE user_profile SET native_lang = ?, preferences = ?, updated_at = ? WHERE id = ?",
      nativeLang, preferences, now, ctx.userId,
    );
  } else {
    ctx.sql.exec(
      "INSERT INTO user_profile (id, native_lang, preferences, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      ctx.userId, nativeLang, preferences, now, now,
    );
  }

  appendEvent(ctx.sql, {
    type: "profile_updated",
    data: { native_lang: nativeLang, preferences: input.preferences ?? null },
  });

  return JSON.stringify({ success: true });
}

function execSetLangProfile(
  input: Record<string, unknown>,
  ctx: ToolExecutionContext,
): string {
  const now = new Date().toISOString();
  const lang = input.lang as string;
  const cefrLevel = input.cefr_level as string;

  const existing = [...ctx.sql.exec("SELECT lang FROM lang_profile WHERE lang = ?", lang)];

  if (existing.length > 0) {
    ctx.sql.exec(
      "UPDATE lang_profile SET cefr_level = ?, onboarded = 1, updated_at = ? WHERE lang = ?",
      cefrLevel, now, lang,
    );
  } else {
    ctx.sql.exec(
      "INSERT INTO lang_profile (lang, cefr_level, onboarded, created_at, updated_at) VALUES (?, ?, 1, ?, ?)",
      lang, cefrLevel, now, now,
    );
  }

  appendEvent(ctx.sql, {
    type: "lang_profile_updated",
    data: { lang, cefr_level: cefrLevel },
    lang,
  });

  return JSON.stringify({ success: true });
}

function execAddConcepts(
  input: Record<string, unknown>,
  ctx: ToolExecutionContext,
): string {
  const now = new Date().toISOString();
  const lang = input.lang as string;
  const concepts = input.concepts as Array<{
    name: string;
    tags?: string;
    state: string;
    notes?: string;
  }>;

  const added: Array<{ id: number; name: string }> = [];
  for (const c of concepts) {
    const cursor = ctx.sql.exec(
      `INSERT INTO concepts (lang, name, tags, state, added_date, notes, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      lang, c.name, c.tags ?? "", c.state, now, c.notes ?? null, now,
    );
    const row = [...cursor][0] as { id: number } | undefined;
    if (row) added.push({ id: row.id, name: c.name });
  }

  appendEvent(ctx.sql, {
    type: "concepts_added",
    data: { concepts: added, lang },
    lang,
    sessionId: ctx.sessionId ?? undefined,
  });

  return JSON.stringify({ success: true, added: added.length, concepts: added });
}

function execUpdateConcept(
  input: Record<string, unknown>,
  ctx: ToolExecutionContext,
): string {
  const now = new Date().toISOString();
  const id = input.concept_id as number;
  const updates: string[] = [];
  const params: unknown[] = [];

  if (input.notes !== undefined) {
    updates.push("notes = ?");
    params.push(input.notes as string);
  }
  if (input.tags !== undefined) {
    updates.push("tags = ?");
    params.push(input.tags as string);
  }

  if (updates.length === 0) {
    return JSON.stringify({ error: "No fields to update" });
  }

  updates.push("updated_at = ?");
  params.push(now, id);

  ctx.sql.exec(
    `UPDATE concepts SET ${updates.join(", ")} WHERE id = ?`,
    ...params,
  );

  appendEvent(ctx.sql, {
    type: "concept_updated",
    data: { concept_id: id, ...input },
    sessionId: ctx.sessionId ?? undefined,
  });

  return JSON.stringify({ success: true });
}

function execMoveConcept(
  input: Record<string, unknown>,
  ctx: ToolExecutionContext,
): string {
  const now = new Date().toISOString();
  const id = input.concept_id as number;
  const newState = input.new_state as string;

  const existing = [...ctx.sql.exec("SELECT state FROM concepts WHERE id = ?", id)];
  if (existing.length === 0) {
    return JSON.stringify({ error: "Concept not found" });
  }
  const oldState = (existing[0] as { state: string }).state;

  const learnedDate = newState === "learned" ? now : null;
  ctx.sql.exec(
    "UPDATE concepts SET state = ?, learned_date = COALESCE(?, learned_date), updated_at = ? WHERE id = ?",
    newState, learnedDate, now, id,
  );

  appendEvent(ctx.sql, {
    type: "concept_moved",
    data: { concept_id: id, from: oldState, to: newState },
    sessionId: ctx.sessionId ?? undefined,
  });

  return JSON.stringify({ success: true, from: oldState, to: newState });
}

function execRecordExerciseResult(
  input: Record<string, unknown>,
  ctx: ToolExecutionContext,
): string {
  const now = new Date().toISOString();
  const conceptId = input.concept_id as number;
  const quality = input.quality as ExerciseQuality;
  const exerciseType = input.exercise_type as string;
  const mode = input.mode as string;

  const existing = [...ctx.sql.exec(
    "SELECT sm2_repetitions, sm2_easiness, sm2_interval FROM concepts WHERE id = ?",
    conceptId,
  )];

  if (existing.length === 0) {
    return JSON.stringify({ error: "Concept not found" });
  }

  const prev = existing[0] as {
    sm2_repetitions: number;
    sm2_easiness: number;
    sm2_interval: number;
  };

  const result = computeSM2(quality, {
    repetitions: prev.sm2_repetitions,
    easiness: prev.sm2_easiness,
    interval: prev.sm2_interval,
  });

  const testField =
    mode === "production" ? "last_production_test" : "last_recognition_test";

  ctx.sql.exec(
    `UPDATE concepts SET
       sm2_repetitions = ?, sm2_easiness = ?, sm2_interval = ?, sm2_next_review = ?,
       ${testField} = ?, updated_at = ?
     WHERE id = ?`,
    result.repetitions,
    result.easiness,
    result.interval,
    result.nextReview,
    now,
    now,
    conceptId,
  );

  appendEvent(ctx.sql, {
    type: "exercise_result",
    data: {
      concept_id: conceptId,
      quality,
      exercise_type: exerciseType,
      mode,
      sm2: result,
    },
    sessionId: ctx.sessionId ?? undefined,
  });

  return JSON.stringify({
    success: true,
    recalled: result.recalled,
    next_review: result.nextReview,
    interval_days: result.interval,
  });
}

function execGetLearnedConcepts(
  input: Record<string, unknown>,
  ctx: ToolExecutionContext,
): string {
  const lang = input.lang as string;
  const limit = (input.limit as number) ?? 50;
  const offset = (input.offset as number) ?? 0;

  const rows = [...ctx.sql.exec(
    "SELECT id, name, tags, learned_date, sm2_next_review, last_production_test, last_recognition_test FROM concepts WHERE lang = ? AND state = 'learned' ORDER BY learned_date DESC LIMIT ? OFFSET ?",
    lang, limit, offset,
  )];

  const total = [...ctx.sql.exec(
    "SELECT COUNT(*) as cnt FROM concepts WHERE lang = ? AND state = 'learned'",
    lang,
  )][0] as { cnt: number } | undefined;

  return JSON.stringify({ concepts: rows, total: total?.cnt ?? 0 });
}

function execSearchConcepts(
  input: Record<string, unknown>,
  ctx: ToolExecutionContext,
): string {
  const lang = input.lang as string;
  const query = input.query as string;
  const pattern = `%${query}%`;

  const rows = [...ctx.sql.exec(
    "SELECT id, name, tags, state, notes FROM concepts WHERE lang = ? AND (name LIKE ? OR tags LIKE ?) LIMIT 20",
    lang, pattern, pattern,
  )];

  return JSON.stringify({ results: rows });
}

function execAddTopic(
  input: Record<string, unknown>,
  ctx: ToolExecutionContext,
): string {
  const now = new Date().toISOString();
  const lang = input.lang as string;
  const description = input.description as string;
  const priority = (input.priority as string) ?? "later";
  const source = (input.source as string) ?? "agent";

  const cursor = ctx.sql.exec(
    "INSERT INTO topics (lang, description, priority, added_date, source, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    lang, description, priority, now, source, now,
  );
  const row = [...cursor][0] as { id: number } | undefined;

  appendEvent(ctx.sql, {
    type: "topic_added",
    data: { id: row?.id, lang, description, priority, source },
    lang,
  });

  return JSON.stringify({ success: true, topic_id: row?.id });
}

function execResolveTopic(
  input: Record<string, unknown>,
  ctx: ToolExecutionContext,
): string {
  const now = new Date().toISOString();
  const topicId = input.topic_id as number;

  ctx.sql.exec(
    "UPDATE topics SET resolved = 1, updated_at = ? WHERE id = ?",
    now, topicId,
  );

  appendEvent(ctx.sql, {
    type: "topic_resolved",
    data: { topic_id: topicId },
  });

  return JSON.stringify({ success: true });
}

function execPlanSessions(
  input: Record<string, unknown>,
  ctx: ToolExecutionContext,
): string {
  const now = new Date().toISOString();
  const sessions = input.sessions as Array<{
    lang: string;
    type: string;
    description: string;
    topic_ids?: string;
    concept_ids?: string;
  }>;

  const maxSeq = [...ctx.sql.exec(
    "SELECT COALESCE(MAX(seq), 0) as max_seq FROM session_plans WHERE status IN ('planned', 'active')",
  )][0] as { max_seq: number } | undefined;

  let seq = (maxSeq?.max_seq ?? 0) + 1;
  const planned: Array<{ id: number; seq: number }> = [];

  for (const s of sessions) {
    const cursor = ctx.sql.exec(
      "INSERT INTO session_plans (lang, type, description, topic_ids, concept_ids, seq, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
      s.lang, s.type, s.description, s.topic_ids ?? null, s.concept_ids ?? null, seq, now, now,
    );
    const row = [...cursor][0] as { id: number } | undefined;
    if (row) planned.push({ id: row.id, seq });
    seq++;
  }

  appendEvent(ctx.sql, {
    type: "sessions_planned",
    data: { plans: planned },
  });

  return JSON.stringify({ success: true, planned });
}

function execUpdateSession(
  input: Record<string, unknown>,
  ctx: ToolExecutionContext,
): string {
  if (!ctx.sessionId) {
    return JSON.stringify({ error: "No active session" });
  }

  const now = new Date().toISOString();
  const updates: string[] = [];
  const params: unknown[] = [];

  if (input.status) {
    updates.push("status = ?");
    params.push(input.status as string);
    if (input.status === "completed" || input.status === "cancelled") {
      updates.push("ended_at = ?");
      params.push(now);
    }
  }
  if (input.planned_exercises) {
    updates.push("planned_exercises = ?");
    params.push(input.planned_exercises as string);
  }
  if (input.results) {
    updates.push("results = ?");
    params.push(input.results as string);
  }

  if (updates.length === 0) {
    return JSON.stringify({ error: "No fields to update" });
  }

  params.push(ctx.sessionId);
  ctx.sql.exec(
    `UPDATE sessions SET ${updates.join(", ")} WHERE id = ?`,
    ...params,
  );

  appendEvent(ctx.sql, {
    type: "session_updated",
    data: { session_id: ctx.sessionId, ...input },
    sessionId: ctx.sessionId,
  });

  return JSON.stringify({ success: true });
}
