import { useState, useEffect, useRef } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Volume2, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlaybackRate } from "@/hooks/useTTS";
import { PLAYBACK_RATES } from "@/hooks/useTTS";

interface AudioReplayButtonProps {
  onReplay: (rate: PlaybackRate) => void;
  onStop?: () => void;
  isPlaying?: boolean;
  title?: string;
  className?: string;
  size?: "icon" | "sm" | "default" | "lg";
  iconClassName?: string;
}

const POPOVER_CLOSE_DELAY_MS = 300;

export function AudioReplayButton({
  onReplay,
  onStop,
  isPlaying = false,
  title = "Replay audio",
  className,
  size = "icon",
  iconClassName = "h-3.5 w-3.5",
}: AudioReplayButtonProps) {
  const [open, setOpen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<PlaybackRate>(1);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isPlaying && open) {
      closeTimeoutRef.current = setTimeout(() => {
        setOpen(false);
        closeTimeoutRef.current = null;
      }, POPOVER_CLOSE_DELAY_MS);
      return () => {
        if (closeTimeoutRef.current) {
          clearTimeout(closeTimeoutRef.current);
        }
      };
    }
  }, [isPlaying, open]);

  function handleTriggerClick() {
    if (isPlaying && onStop) {
      onStop();
    } else if (!open) {
      onReplay(playbackRate);
    }
  }

  function handleSpeedClick(rate: PlaybackRate) {
    setPlaybackRate(rate);
    setOpen(false);
    onReplay(rate);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size={size}
          className={cn("shrink-0", className)}
          title={isPlaying ? "Stop" : title}
          onClick={handleTriggerClick}
        >
          {isPlaying ? (
            <Square
              className={cn(iconClassName, "fill-current scale-[0.67]")}
            />
          ) : (
            <Volume2 className={iconClassName} />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" className="flex w-auto gap-1 p-1.5">
        {PLAYBACK_RATES.map((rate) => (
          <button
            key={rate}
            type="button"
            onClick={() => handleSpeedClick(rate)}
            className={cn(
              "rounded px-2 py-1 text-xs transition-colors",
              playbackRate === rate
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            )}
          >
            {rate}x
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
