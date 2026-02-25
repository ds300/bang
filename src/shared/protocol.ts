import type { ChatMessage, AgentStep } from "./types";

// Client -> Server
export type ClientMessage =
  | { type: "new_session"; lang: string }
  | { type: "resume_session"; sessionId: string }
  | { type: "chat"; text: string }
  | { type: "end_session"; discard?: boolean }
  | { type: "get_state" };

// Server -> Client
export type ServerMessage =
  | {
      type: "state";
      messages: ChatMessage[];
      sessionActive: boolean;
      sessionId: string | null;
      lang: string | null;
      onboarded: boolean;
    }
  | { type: "assistant_message"; text: string; messageId: string; onboarded: boolean }
  | { type: "user_message_ack"; messageId: string }
  | { type: "agent_thinking"; thinking: boolean }
  | { type: "agent_step"; step: AgentStep }
  | { type: "session_started"; sessionId: string }
  | { type: "session_ended" }
  | { type: "error"; message: string };
