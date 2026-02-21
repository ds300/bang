import { Button } from "@/components/ui/button";
import type { PendingOptions } from "@/hooks/useSession";

interface OptionsCardProps {
  pending: PendingOptions;
  onSelect: (toolCallId: string, optionId: string, label: string) => void;
}

export function OptionsCard({ pending, onSelect }: OptionsCardProps) {
  return (
    <div className="flex w-full justify-start">
      <div className="max-w-[85%] space-y-3">
        <p className="text-sm text-muted-foreground">{pending.prompt}</p>
        <div className="flex flex-wrap gap-2">
          {pending.options.map((opt) => (
            <Button
              key={opt.id}
              variant="outline"
              className="h-auto flex-col items-start gap-0.5 px-4 py-2.5 text-left"
              onClick={() =>
                onSelect(pending.toolCallId, opt.id, opt.label)
              }
            >
              <span className="text-sm font-medium">{opt.label}</span>
              {opt.description && (
                <span className="text-xs text-muted-foreground">
                  {opt.description}
                </span>
              )}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
