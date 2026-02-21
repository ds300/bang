export type ExerciseType =
  | "listening"
  | "translation"
  | "writing_prompt"
  | "spot_the_error";

export interface Exercise {
  type: ExerciseType;
  id: string;
  prompt: string;
  /** Target-language sentence (hidden for listening exercises until revealed) */
  targetText?: string;
  /** Native-language sentence (for translation exercises) */
  nativeText?: string;
  /** Concepts/vocab to use (for writing prompts) */
  concepts?: string[];
}

export interface OptionItem {
  id: string;
  label: string;
  description?: string;
}

// Frontend -> Backend
export type ClientMessage =
  | { type: "chat"; text: string }
  | { type: "tool_response"; toolCallId: string; data: unknown }
  | { type: "new_session"; lang: string }
  | { type: "end_session"; discard?: boolean }
  | { type: "request_breakdown"; sentenceId: string; sentence: string }
  | { type: "set_language"; lang: string };

// Backend -> Frontend
export type ServerMessage =
  | { type: "assistant_text"; text: string; messageId: string }
  | { type: "assistant_text_delta"; delta: string; messageId: string }
  | { type: "exercise"; exercise: Exercise; toolCallId: string }
  | {
      type: "options";
      options: OptionItem[];
      prompt: string;
      toolCallId: string;
    }
  | { type: "session_started"; sessionId: string }
  | { type: "session_ended"; summary: string }
  | { type: "error"; message: string }
  | { type: "agent_thinking"; thinking: boolean };
