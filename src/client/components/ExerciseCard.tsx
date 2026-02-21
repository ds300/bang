import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PendingExercise } from "@/hooks/useSession";
import { Eye, Volume2 } from "lucide-react";

interface ExerciseCardProps {
  pending: PendingExercise;
  onSubmit: (toolCallId: string, answer: string) => void;
  speak?: (text: string) => void;
  audioEnabled?: boolean;
}

export function ExerciseCard({
  pending,
  onSubmit,
  speak,
  audioEnabled,
}: ExerciseCardProps) {
  const { exercise, toolCallId } = pending;
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const hasAutoPlayed = useRef(false);

  const isListening = exercise.type === "listening";

  // Auto-play audio for listening exercises
  useEffect(() => {
    if (
      isListening &&
      audioEnabled &&
      speak &&
      exercise.targetText &&
      !hasAutoPlayed.current
    ) {
      hasAutoPlayed.current = true;
      speak(exercise.targetText);
    }
  }, [isListening, audioEnabled, speak, exercise.targetText]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim()) return;

    const submittedAnswer = answer.trim();
    // For listening exercises, if user revealed text, note that in the response
    const answerData = isListening && revealed
      ? `${submittedAnswer} [text was revealed]`
      : submittedAnswer;

    onSubmit(toolCallId, answerData);
    setAnswer("");
  }

  function handleReveal() {
    setRevealed(true);
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
          <div className="flex items-center gap-2">
            {speak && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => speak(exercise.targetText!)}
                title="Replay audio"
              >
                <Volume2 className="mr-1.5 h-4 w-4" />
                Replay
              </Button>
            )}
            {revealed ? (
              <p className="text-sm font-medium italic">
                {exercise.targetText}
              </p>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReveal}
                className="text-muted-foreground"
              >
                <Eye className="mr-1.5 h-4 w-4" />
                Show text
              </Button>
            )}
          </div>
        )}

        {exercise.type === "translation" && exercise.nativeText && (
          <p className="border-l-2 pl-3 text-sm font-medium italic">
            {exercise.nativeText}
          </p>
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
          <p className="border-l-2 border-destructive pl-3 text-sm font-medium italic">
            {exercise.targetText}
          </p>
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
