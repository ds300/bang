export function initSchema(sql: SqlStorage): void {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      data TEXT NOT NULL,
      lang TEXT,
      session_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_profile (
      id TEXT PRIMARY KEY,
      native_lang TEXT NOT NULL,
      preferences TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lang_profile (
      lang TEXT PRIMARY KEY,
      cefr_level TEXT,
      onboarded INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS concepts_upcoming (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lang TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'later',
      source TEXT NOT NULL,
      source_session_id TEXT,
      source_detail TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS concepts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lang TEXT NOT NULL,
      name TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL,
      added_date TEXT NOT NULL,
      learned_date TEXT,
      notes TEXT,
      source_upcoming_id INTEGER,
      sm2_repetitions INTEGER DEFAULT 0,
      sm2_easiness REAL DEFAULT 2.5,
      sm2_interval INTEGER DEFAULT 0,
      sm2_next_review TEXT,
      last_production_test TEXT,
      last_recognition_test TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vocab (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lang TEXT NOT NULL,
      word TEXT NOT NULL,
      lemma TEXT,
      times_seen INTEGER NOT NULL DEFAULT 0,
      times_produced INTEGER NOT NULL DEFAULT 0,
      times_heard INTEGER NOT NULL DEFAULT 0,
      first_seen_at TEXT,
      last_seen_at TEXT,
      first_produced_at TEXT,
      last_produced_at TEXT,
      first_heard_at TEXT,
      last_heard_at TEXT,
      UNIQUE(lang, word)
    );

    CREATE TABLE IF NOT EXISTS lessons_upcoming (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lang TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      upcoming_concept_ids TEXT,
      review_concept_ids TEXT,
      seq INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'planned',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      lang TEXT NOT NULL,
      plan_id INTEGER,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      planned_exercises TEXT,
      results TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      message_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      type TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
