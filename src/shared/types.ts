export interface UserProfile {
  id: string;
  native_lang: string;
  preferences: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface LangProfile {
  lang: string;
  cefr_level: string | null;
  onboarded: number;
  created_at: string;
  updated_at: string;
}

export interface Concept {
  id: number;
  lang: string;
  name: string;
  tags: string;
  state: "current" | "review" | "learned";
  added_date: string;
  learned_date: string | null;
  notes: string | null;
  sm2_repetitions: number;
  sm2_easiness: number;
  sm2_interval: number;
  sm2_next_review: string | null;
  last_production_test: string | null;
  last_recognition_test: string | null;
  updated_at: string;
}

export interface Topic {
  id: number;
  lang: string;
  description: string;
  priority: "next" | "soon" | "later";
  added_date: string;
  source: string | null;
  resolved: number;
  updated_at: string;
}

export interface SessionPlan {
  id: number;
  lang: string;
  type: "practice" | "conversation" | "learning";
  description: string;
  topic_ids: string | null;
  concept_ids: string | null;
  seq: number;
  status: "planned" | "active" | "completed" | "skipped";
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  lang: string;
  plan_id: number | null;
  type: string;
  status: string;
  planned_exercises: string | null;
  results: string | null;
  started_at: string;
  ended_at: string | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export interface AgentStep {
  type: "tool_call" | "tool_result" | "api_call" | "error";
  name?: string;
  input?: unknown;
  result?: unknown;
  error?: string;
}
