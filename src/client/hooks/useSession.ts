import { useCallback, useEffect, useReducer, useRef } from "react";
import type { ClientMessage, ServerMessage } from "@shared/protocol";

const STORAGE_KEY = "bang-session";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

interface SessionState {
  messages: ChatMessage[];
  lang: string;
  sessionActive: boolean;
  agentThinking: boolean;
}

type SessionAction =
  | { type: "add_user_message"; text: string }
  | { type: "add_assistant_message"; text: string; messageId: string }
  | { type: "set_thinking"; thinking: boolean }
  | { type: "session_started" }
  | { type: "session_ended" }
  | { type: "clear_all" }
  | { type: "set_lang"; lang: string };

const DEFAULT_STATE: SessionState = {
  messages: [],
  lang: "es",
  sessionActive: false,
  agentThinking: false,
};

interface PersistedData {
  messages?: ChatMessage[];
  lang?: string;
  sessionActive?: boolean;
}

function loadPersistedState(): SessionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const saved = JSON.parse(raw) as PersistedData;
    return {
      ...DEFAULT_STATE,
      messages: saved.messages ?? [],
      lang: saved.lang ?? "es",
      sessionActive: saved.sessionActive ?? false,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function persistState(state: SessionState) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        messages: state.messages,
        lang: state.lang,
        sessionActive: state.sessionActive,
      })
    );
  } catch {
    // storage full or unavailable
  }
}

function reducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "add_user_message":
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: crypto.randomUUID(), role: "user", text: action.text },
        ],
      };
    case "add_assistant_message":
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: action.messageId, role: "assistant", text: action.text },
        ],
      };
    case "set_thinking":
      return { ...state, agentThinking: action.thinking };
    case "session_started":
      return { ...state, sessionActive: true };
    case "session_ended":
      return { ...state, sessionActive: false };
    case "clear_all":
      return {
        ...state,
        messages: [],
        sessionActive: false,
        agentThinking: false,
      };
    case "set_lang":
      return { ...state, lang: action.lang };
    default:
      return state;
  }
}

export function useSession(
  send: (msg: ClientMessage) => void,
  addHandler: (handler: (msg: ServerMessage) => void) => () => void,
  connected: boolean
) {
  const [state, dispatch] = useReducer(reducer, null, loadPersistedState);

  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    persistState(state);
  }, [state]);

  const hasReconnected = useRef(false);

  useEffect(() => {
    if (connected && stateRef.current.sessionActive && !hasReconnected.current) {
      hasReconnected.current = true;
      send({ type: "reconnect", lang: stateRef.current.lang });
    }
    if (!connected) {
      hasReconnected.current = false;
    }
  }, [connected, send]);

  useEffect(() => {
    return addHandler((msg) => {
      switch (msg.type) {
        case "assistant_text":
          dispatch({
            type: "add_assistant_message",
            text: msg.text,
            messageId: msg.messageId,
          });
          break;
        case "agent_thinking":
          dispatch({ type: "set_thinking", thinking: msg.thinking });
          break;
        case "session_started":
          dispatch({ type: "session_started" });
          break;
        case "session_ended":
          dispatch({ type: "session_ended" });
          break;
        case "error":
          dispatch({
            type: "add_assistant_message",
            text: `Error: ${msg.message}`,
            messageId: crypto.randomUUID(),
          });
          break;
      }
    });
  }, [addHandler]);

  const sendChat = useCallback(
    (text: string) => {
      dispatch({ type: "add_user_message", text });
      send({ type: "chat", text });
    },
    [send]
  );

  const startSession = useCallback(() => {
    dispatch({ type: "clear_all" });
    dispatch({ type: "set_thinking", thinking: true });
    send({ type: "new_session", lang: stateRef.current.lang });
  }, [send]);

  const endSession = useCallback(
    (discard?: boolean) => {
      send({ type: "end_session", discard });
    },
    [send]
  );

  const setLang = useCallback((lang: string) => {
    dispatch({ type: "set_lang", lang });
  }, []);

  return {
    ...state,
    sendChat,
    startSession,
    endSession,
    setLang,
  };
}
