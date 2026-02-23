import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Copy, Check } from "lucide-react";

interface AuthScreenProps {
  onLogin: (password: string) => Promise<{ error?: string }>;
  onSignup: () => Promise<{ password?: string; error?: string }>;
  loading: boolean;
}

export function AuthScreen({ onLogin, onSignup, loading }: AuthScreenProps) {
  const [mode, setMode] = useState<"login" | "signup" | "show-password">(
    "login",
  );
  const [password, setPassword] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const result = await onLogin(password);
    if (result.error) setError(result.error);
  }

  async function handleSignup() {
    setError("");
    const result = await onSignup();
    if (result.error) {
      setError(result.error);
    } else if (result.password) {
      setGeneratedPassword(result.password);
      setMode("show-password");
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(generatedPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (mode === "show-password") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <h1 className="text-2xl font-semibold">Your Password</h1>
          <p className="text-sm text-muted-foreground">
            Save this password somewhere safe. It's the only way to access your
            account.
          </p>
          <div className="flex items-center gap-2 rounded-lg border bg-muted p-3">
            <code className="flex-1 text-sm font-mono select-all">
              {generatedPassword}
            </code>
            <Button variant="ghost" size="icon" onClick={handleCopy}>
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            You're now logged in. Start learning!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Bang</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Language tutor
          </p>
        </div>

        {mode === "login" && (
          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoFocus
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Log in"
              )}
            </Button>
            <div className="text-center">
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-foreground underline"
                onClick={() => {
                  setMode("signup");
                  setError("");
                }}
              >
                Create new account
              </button>
            </div>
          </form>
        )}

        {mode === "signup" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              A random password will be generated for you. No email needed.
            </p>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button
              className="w-full"
              onClick={handleSignup}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Generate account"
              )}
            </Button>
            <div className="text-center">
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-foreground underline"
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
              >
                Already have a password?
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
