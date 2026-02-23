export interface EventPayload {
  type: string;
  data: Record<string, unknown>;
  lang?: string;
  sessionId?: string;
}

export function appendEvent(sql: SqlStorage, event: EventPayload): number {
  const cursor = sql.exec(
    "INSERT INTO events (type, data, lang, session_id) VALUES (?, ?, ?, ?) RETURNING id",
    event.type,
    JSON.stringify(event.data),
    event.lang ?? null,
    event.sessionId ?? null,
  );
  const row = [...cursor][0] as { id: number } | undefined;
  return row?.id ?? 0;
}

export function getEvents(
  sql: SqlStorage,
  opts?: { type?: string; lang?: string; limit?: number; offset?: number },
): Array<{ id: number; type: string; data: string; lang: string | null; session_id: string | null; created_at: string }> {
  let query = "SELECT * FROM events WHERE 1=1";
  const params: unknown[] = [];

  if (opts?.type) {
    query += " AND type = ?";
    params.push(opts.type);
  }
  if (opts?.lang) {
    query += " AND lang = ?";
    params.push(opts.lang);
  }

  query += " ORDER BY id DESC";

  if (opts?.limit) {
    query += " LIMIT ?";
    params.push(opts.limit);
  }
  if (opts?.offset) {
    query += " OFFSET ?";
    params.push(opts.offset);
  }

  return [...sql.exec(query, ...params)] as Array<{
    id: number;
    type: string;
    data: string;
    lang: string | null;
    session_id: string | null;
    created_at: string;
  }>;
}
