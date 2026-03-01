import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface SessionControlsProps {
  sessionActive: boolean;
  onStartSession: () => void;
  onEndSession: (discard?: boolean) => void;
  disableStart?: boolean;
}

export function SessionControls({
  sessionActive: _sessionActive,
  onStartSession,
  onEndSession: _onEndSession,
  disableStart = false,
}: SessionControlsProps) {
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={onStartSession}
      title="Start session"
      disabled={disableStart}
    >
      <Plus className="h-4 w-4" />
    </Button>
  );
}
