// Frontend -> Backend
export type ClientMessage =
  | { type: "chat"; text: string; targetLangMode?: boolean }
  | { type: "new_session"; lang: string; targetLangMode?: boolean }
  | { type: "end_session"; discard?: boolean }
  | { type: "reconnect"; lang: string; targetLangMode?: boolean }
  | { type: "set_language"; lang: string };

// Backend -> Frontend
export type ServerMessage =
  | { type: "assistant_text"; text: string; messageId: string }
  | { type: "session_started"; sessionId: string }
  | { type: "session_ended"; summary: string }
  | { type: "error"; message: string }
  | { type: "agent_thinking"; thinking: boolean };
