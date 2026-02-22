import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  shouldFocus?: boolean;
}

export function ChatInput({
  onSend,
  disabled,
  placeholder = "Type a message...",
  shouldFocus,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (shouldFocus && !disabled && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [shouldFocus, disabled]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-end">
      <Textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
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
