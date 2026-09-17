import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Sign in — Loopback interview boards" },
      {
        name: "description",
        content:
          "Sign in to create shared system design interview boards and invite candidates with a link.",
      },
      { property: "og:title", content: "Sign in — Loopback interview boards" },
      {
        property: "og:description",
        content: "Create shared system design interview boards and invite candidates with a link.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function safePath(p?: string) {
  return p && p.startsWith("/") && !p.startsWith("//") ? p : "/dashboard";
}

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("interviewer@example.com");
  const [password, setPassword] = useState("password123");
  const [busy, setBusy] = useState(false);
  const dest = safePath(search.redirect);

  useEffect(() => {
    if (api.auth.isAuthenticated()) {
      api.auth
        .me()
        .then(() => navigate({ to: dest, replace: true }))
        .catch(() => api.auth.clearToken());
    }
  }, [dest, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        await api.auth.signup({ email, password });
        toast.success("Account created successfully!");
      } else {
        await api.auth.login({ email, password });
        toast.success("Signed in successfully!");
      }
      navigate({ to: dest, replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4">
      <div className="blueprint-grid pointer-events-none absolute inset-0 opacity-25" />
      <div className="panel relative w-full max-w-md p-8">
        <p className="label-mono">Loopback</p>
        <h1 className="mt-2 text-2xl font-semibold">
          {mode === "signin" ? "Sign in to your boards" : "Create an interviewer account"}
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Connected to local FastAPI backend ({import.meta.env.VITE_API_URL || "http://localhost:8091"})
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <div className="mt-4 rounded-md border border-border/60 bg-surface-raised/40 p-3 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Seed credentials:</span>{" "}
          <code>interviewer@example.com</code> / <code>password123</code>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signin" ? "No account yet?" : "Already have an account?"}{" "}
          <button
            type="button"
            className="text-primary underline-offset-4 hover:underline"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </p>
        <p className="mt-4 text-center">
          <Link to="/" className="label-mono hover:text-foreground">
            Back to home
          </Link>
        </p>
      </div>
    </main>
  );
}
