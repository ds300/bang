import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PendingExercise } from "@/hooks/useSession";
import { Eye } from "lucide-react";

interface ExerciseCardProps {
  pending: PendingExercise;
  onSubmit: (toolCallId: string, answer: string) => void;
}

export function ExerciseCard({ pending, onSubmit }: ExerciseCardProps) {
  const { exercise, toolCallId } = pending;
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);

  const isListening = exercise.type === "listening";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim()) return;
    onSubmit(toolCallId, answer.trim());
    setAnswer("");
  }

  return (
    <div className="flex w-full justify-start">
      <div className="bg-card border max-w-[85%] space-y-3 rounded-xl p-4">
        <div className="flex items-center gap-2">
          <span className="bg-secondary text-secondary-foreground rounded-md px-2 py-0.5 text-xs font-medium uppercase tracking-wide">
            {exercise.type.replace("_", " ")}
          </span>
        </div>

        <p className="text-sm">{exercise.prompt}</p>

        {isListening && exercise.targetText && (
          <div className="space-y-2">
            {revealed ? (
              <p className="text-sm font-medium italic">
                {exercise.targetText}
              </p>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRevealed(true)}
                className="text-muted-foreground"
              >
                <Eye className="mr-1.5 h-4 w-4" />
                Show text
              </Button>
            )}
          </div>
        )}

        {exercise.type === "translation" && exercise.nativeText && (
          <p className="text-sm font-medium italic">{exercise.nativeText}</p>
        )}

        {exercise.type === "writing_prompt" && exercise.concepts && (
          <div className="flex flex-wrap gap-1.5">
            {exercise.concepts.map((c) => (
              <span
                key={c}
                className="bg-accent text-accent-foreground rounded-md px-2 py-0.5 text-xs"
              >
                {c}
              </span>
            ))}
          </div>
        )}

        {exercise.type === "spot_the_error" && exercise.targetText && (
          <p className="text-sm font-medium italic">{exercise.targetText}</p>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Your answer..."
            className="text-sm"
            autoFocus
          />
          <Button type="submit" size="sm" disabled={!answer.trim()}>
            Submit
          </Button>
        </form>
      </div>
    </div>
  );
}
