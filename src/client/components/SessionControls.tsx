import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus } from "lucide-react";

interface SessionControlsProps {
  sessionActive: boolean;
  onStartSession: () => void;
  onEndSession: (discard?: boolean) => void;
}

export function SessionControls({
  sessionActive,
  onStartSession,
  onEndSession,
}: SessionControlsProps) {
  const [showEndDialog, setShowEndDialog] = useState(false);

  useEffect(() => {
    if (!sessionActive) setShowEndDialog(false);
  }, [sessionActive]);

  function handleClick() {
    if (sessionActive) {
      setShowEndDialog(true);
    } else {
      onStartSession();
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        onClick={handleClick}
        title={sessionActive ? "New session" : "Start session"}
      >
        <Plus className="h-4 w-4" />
      </Button>

      <AlertDialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End current session?</AlertDialogTitle>
            <AlertDialogDescription>
              You have an active session. Would you like to save your progress
              or discard it?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="outline"
              onClick={() => {
                setShowEndDialog(false);
                onEndSession(true);
              }}
            >
              Discard
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => {
                setShowEndDialog(false);
                onEndSession(false);
              }}
            >
              Save & End
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
