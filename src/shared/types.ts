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

export interface ConceptUpcoming {
  id: number;
  lang: string;
  name: string;
  description: string | null;
  type: "vocabulary" | "grammar" | "idiom" | "usage" | "other";
  priority: "next" | "soon" | "later";
  source: "highlight" | "user_request" | "ai_suggestion" | "curriculum";
  source_session_id: string | null;
  source_detail: string | null;
  created_at: string;
  updated_at: string;
}

export interface Concept {
  id: number;
  lang: string;
  name: string;
  tags: string;
  state: "introducing" | "reinforcing";
  added_date: string;
  learned_date: string | null;
  notes: string | null;
  source_upcoming_id: number | null;
  sm2_repetitions: number;
  sm2_easiness: number;
  sm2_interval: number;
  sm2_next_review: string | null;
  last_production_test: string | null;
  last_recognition_test: string | null;
  updated_at: string;
}

export interface VocabEntry {
  id: number;
  lang: string;
  word: string;
  lemma: string | null;
  times_seen: number;
  times_produced: number;
  times_heard: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  first_produced_at: string | null;
  last_produced_at: string | null;
  first_heard_at: string | null;
  last_heard_at: string | null;
}

export interface LessonPlan {
  id: number;
  lang: string;
  type: "practice" | "conversation" | "learning";
  title: string;
  description: string;
  upcoming_concept_ids: string | null;
  review_concept_ids: string | null;
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
