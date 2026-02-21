import { TooltipProvider } from "@/components/ui/tooltip";
import { useSystemTheme } from "@/hooks/useTheme";

export function App() {
  useSystemTheme();

  return (
    <TooltipProvider>
      <div className="flex h-screen items-center justify-center">
        <h1 className="text-2xl font-semibold">Bang</h1>
      </div>
    </TooltipProvider>
  );
}
