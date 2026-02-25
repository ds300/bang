import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  shouldFocus?: boolean;
  /** Previous user messages in this session (newest first) for Up/Down history */
  userMessageHistory?: string[];
}

export function ChatInput({
  onSend,
  disabled,
  placeholder = "Type a message...",
  shouldFocus,
  userMessageHistory = [],
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [historyIndex, setHistoryIndex] = useState(-1);
  const draftRef = useRef("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (shouldFocus && !disabled && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [shouldFocus, disabled]);

  useEffect(() => {
    if (historyIndex >= 0 && historyIndex < userMessageHistory.length) {
      setText(userMessageHistory[historyIndex] ?? "");
    }
  }, [historyIndex, userMessageHistory]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText("");
    setHistoryIndex(-1);
    draftRef.current = "";
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
      return;
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      if (userMessageHistory.length === 0) return;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (historyIndex < 0) {
          draftRef.current = text;
          setHistoryIndex(0);
          setText(userMessageHistory[0] ?? "");
        } else if (historyIndex < userMessageHistory.length - 1) {
          setHistoryIndex(historyIndex + 1);
          setText(userMessageHistory[historyIndex + 1] ?? "");
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (historyIndex <= 0) {
          setHistoryIndex(-1);
          setText(draftRef.current);
        } else {
          setHistoryIndex(historyIndex - 1);
          setText(userMessageHistory[historyIndex - 1] ?? "");
        }
        return;
      }
    }
  }

  function handleChange(value: string) {
    setText(value);
    if (historyIndex >= 0) setHistoryIndex(-1);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-end">
      <Textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 min-h-[3.5rem] max-h-40 resize-none"
        rows={2}
      />
      <Button
        type="submit"
        size="icon"
        className="shrink-0 h-[3.5rem] w-10"
        disabled={!text.trim() || disabled}
      >
        <Send className="h-4 w-4" />
      </Button>
    </form>
  );
}
