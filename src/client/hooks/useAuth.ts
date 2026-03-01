import { useState, useCallback, useEffect } from "react";

const PASSWORD_KEY = "bang-password";
const TOKEN_KEY = "bang-token";

interface AuthState {
  password: string | null;
  token: string | null;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>(() => ({
    password: localStorage.getItem(PASSWORD_KEY),
    token: localStorage.getItem(TOKEN_KEY),
    loading: false,
  }));

  const isAuthenticated = !!state.token;

  useEffect(() => {
    if (state.password && !state.token) {
      login(state.password);
    }
  }, []);

  async function login(password: string): Promise<{ error?: string }> {
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json();
        setState((s) => ({ ...s, loading: false }));
        return { error: data.error ?? "Login failed" };
      }
      const data = await res.json();
      localStorage.setItem(PASSWORD_KEY, password);
      localStorage.setItem(TOKEN_KEY, data.token);
      setState({ password, token: data.token, loading: false });
      return {};
    } catch (err) {
      setState((s) => ({ ...s, loading: false }));
      return { error: "Network error" };
    }
  }

  async function signup(): Promise<{
    password?: string;
    token?: string;
    error?: string;
  }> {
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch("/api/signup", { method: "POST" });
      if (!res.ok) {
        setState((s) => ({ ...s, loading: false }));
        return { error: "Signup failed" };
      }
      const data = await res.json();
      // Store password so we can log in later; do NOT set token yet so we stay on AuthScreen
      // until the user clicks Continue (see finishSignup).
      localStorage.setItem(PASSWORD_KEY, data.password);
      setState((s) => ({ ...s, loading: false }));
      return { password: data.password, token: data.token };
    } catch (err) {
      setState((s) => ({ ...s, loading: false }));
      return { error: "Network error" };
    }
  }

  function finishSignup(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
    setState((s) => ({ ...s, token }));
  }

  const logout = useCallback(() => {
    localStorage.removeItem(PASSWORD_KEY);
    localStorage.removeItem(TOKEN_KEY);
    setState({ password: null, token: null, loading: false });
  }, []);

  return {
    isAuthenticated,
    token: state.token,
    loading: state.loading,
    login,
    signup,
    finishSignup,
    logout,
  };
}
