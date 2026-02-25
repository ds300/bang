import { useCallback, useEffect, useReducer, useRef } from "react";
import type { ClientMessage, ServerMessage } from "@shared/protocol";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

interface SessionState {
  messages: ChatMessage[];
  lang: string;
  sessionActive: boolean;
  sessionId: string | null;
  agentThinking: boolean;
  restored: boolean;
  onboarded: boolean;
}

type SessionAction =
  | { type: "set_state"; messages: ChatMessage[]; sessionActive: boolean; sessionId: string | null; lang: string | null; onboarded: boolean }
  | { type: "add_user_message"; text: string; messageId: string }
  | { type: "add_assistant_message"; text: string; messageId: string; onboarded: boolean }
  | { type: "set_thinking"; thinking: boolean }
  | { type: "session_started"; sessionId: string }
  | { type: "session_ended" }
  | { type: "set_lang"; lang: string };

const DEFAULT_STATE: SessionState = {
  messages: [],
  lang: "es",
  sessionActive: false,
  sessionId: null,
  agentThinking: false,
  restored: false,
  onboarded: false,
};

function reducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "set_state":
      return {
        ...state,
        messages: action.messages,
        sessionActive: action.sessionActive,
        sessionId: action.sessionId,
        lang: action.lang ?? state.lang,
        agentThinking: false,
        restored: true,
        onboarded: action.onboarded,
      };
    case "add_user_message":
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: action.messageId, role: "user", text: action.text },
        ],
      };
    case "add_assistant_message":
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: action.messageId, role: "assistant", text: action.text },
        ],
        restored: false,
        onboarded: action.onboarded,
      };
    case "set_thinking":
      return { ...state, agentThinking: action.thinking };
    case "session_started":
      return { ...state, sessionActive: true, sessionId: action.sessionId, messages: [], agentThinking: true };
    case "session_ended":
      return { ...state, sessionActive: false, sessionId: null, agentThinking: false };
    case "set_lang":
      return { ...state, lang: action.lang };
    default:
      return state;
  }
}

export function useSession(
  send: (msg: ClientMessage) => void,
  addHandler: (handler: (msg: ServerMessage) => void) => () => void,
  connected: boolean,
) {
  const [state, dispatch] = useReducer(reducer, DEFAULT_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    return addHandler((msg) => {
      switch (msg.type) {
        case "state":
          dispatch({
            type: "set_state",
            messages: msg.messages,
            sessionActive: msg.sessionActive,
            sessionId: msg.sessionId ?? null,
            lang: msg.lang,
            onboarded: msg.onboarded,
          });
          break;
        case "assistant_message":
          dispatch({
            type: "add_assistant_message",
            text: msg.text,
            messageId: msg.messageId,
            onboarded: msg.onboarded,
          });
          break;
        case "agent_thinking":
          dispatch({ type: "set_thinking", thinking: msg.thinking });
          break;
        case "session_started":
          dispatch({ type: "session_started", sessionId: msg.sessionId });
          break;
        case "session_ended":
          dispatch({ type: "session_ended" });
          break;
        case "error":
          dispatch({ type: "set_thinking", thinking: false });
          dispatch({
            type: "add_assistant_message",
            text: `Error: ${msg.message}`,
            messageId: crypto.randomUUID(),
            onboarded: stateRef.current.onboarded,
          });
          break;
      }
    });
  }, [addHandler]);

  // Explicitly request state when connected (or reconnected)
  useEffect(() => {
    if (connected) {
      send({ type: "get_state" });
    }
  }, [connected, send]);

  const sendChat = useCallback(
    (text: string) => {
      const messageId = crypto.randomUUID();
      dispatch({ type: "add_user_message", text, messageId });
      send({ type: "chat", text });
    },
    [send],
  );

  const startSession = useCallback(() => {
    send({ type: "new_session", lang: stateRef.current.lang });
  }, [send]);

  const endSession = useCallback(
    (discard?: boolean) => {
      send({ type: "end_session", discard });
    },
    [send],
  );

  const resumeSession = useCallback(
    (sessionId: string) => {
      send({ type: "resume_session", sessionId });
    },
    [send],
  );

  const setLang = useCallback((lang: string) => {
    dispatch({ type: "set_lang", lang });
  }, []);

  return {
    ...state,
    sendChat,
    startSession,
    endSession,
    resumeSession,
    setLang,
  };
}
