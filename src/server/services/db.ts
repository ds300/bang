import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = "data/bang.db";

let db: DatabaseSync;

export function initDb() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      lang TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      message_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export interface SessionRecord {
  id: string;
  lang: string;
  active: number;
  created_at: string;
}

export interface MessageRecord {
  role: string;
  text: string;
  message_id: string;
}

export function createSessionRecord(id: string, lang: string) {
  db.prepare("INSERT INTO sessions (id, lang) VALUES (?, ?)").run(id, lang);
}

export function deactivateAllSessions() {
  db.prepare("UPDATE sessions SET active = 0 WHERE active = 1").run();
}

export function deactivateSession(id: string) {
  db.prepare("UPDATE sessions SET active = 0 WHERE id = ?").run(id);
}

export function getActiveSessionRecord(): SessionRecord | undefined {
  return db
    .prepare(
      "SELECT id, lang, active, created_at FROM sessions WHERE active = 1 ORDER BY created_at DESC LIMIT 1"
    )
    .get() as SessionRecord | undefined;
}

export function addMessageRecord(
  sessionId: string,
  role: string,
  text: string,
  messageId: string
) {
  db.prepare(
    "INSERT INTO messages (session_id, role, text, message_id) VALUES (?, ?, ?, ?)"
  ).run(sessionId, role, text, messageId);
}

export function getSessionMessages(sessionId: string): MessageRecord[] {
  return db
    .prepare(
      "SELECT role, text, message_id FROM messages WHERE session_id = ? ORDER BY id"
    )
    .all(sessionId) as MessageRecord[];
}
