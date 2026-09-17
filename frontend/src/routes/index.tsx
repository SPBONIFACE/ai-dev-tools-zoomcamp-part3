import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SHAPES } from "@/lib/board-types";
import { ShapeGlyph } from "@/components/board/shapes";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Loopback — live system design interview boards" },
      {
        name: "description",
        content:
          "Run system design interviews on a shared canvas. Send one link, sketch services, queues, databases and LLM calls together in real time.",
      },
      { property: "og:title", content: "Loopback — live system design interview boards" },
      {
        property: "og:description",
        content:
          "Send one link and design systems together: components, arrows and freehand drawing, synced live.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const [signedIn, setSignedIn] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    if (api.auth.isAuthenticated()) {
      api.auth
        .me()
        .then(() => setSignedIn(true))
        .catch(() => setSignedIn(false));
    } else {
      setSignedIn(false);
    }
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="blueprint-grid pointer-events-none absolute inset-0 opacity-20" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[48rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="label-mono text-foreground">Loopback</span>
        <nav className="flex items-center gap-2">
          {signedIn ? (
            <Button asChild size="sm">
              <Link to="/dashboard">My sessions</Link>
            </Button>
          ) : (
            <Button asChild size="sm" variant="secondary">
              <Link to="/auth">Interviewer sign in</Link>
            </Button>
          )}
        </nav>
      </header>

      <main className="relative mx-auto max-w-6xl px-6 pb-24">
        <section className="pt-16 md:pt-24">
          <p className="label-mono">Real-time collaborative whiteboard</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.05] md:text-6xl">
            System design interviews on one shared canvas.
          </h1>
          <p className="mt-6 max-w-xl text-base text-muted-foreground md:text-lg">
            Create a session, send the link, and draw the architecture together — services, queues,
            databases, LLM calls, arrows and freehand sketching, all synced as you move.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link to={signedIn ? "/dashboard" : "/auth"}>Start a session</Link>
            </Button>
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim()) window.location.assign(`/b/${code.trim()}`);
              }}
            >
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Join code"
                className="w-40"
                aria-label="Join code"
              />
              <Button type="submit" variant="secondary" size="lg">
                Join
              </Button>
            </form>
          </div>
        </section>

        <section className="panel mt-20 p-8">
          <h2 className="text-sm font-semibold">Components ready to drop</h2>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {SHAPES.filter((s) => s.key !== "group").map((s) => (
              <div key={s.key} className="flex items-center gap-3 rounded-md bg-surface-raised p-3">
                <ShapeGlyph shape={s.key} color={s.color} />
                <div className="min-w-0">
                  <p className="truncate text-sm">{s.name}</p>
                  {s.sub && <p className="label-mono truncate">{s.sub}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16 grid gap-6 md:grid-cols-3">
          {[
            {
              t: "One link, everyone in",
              d: "Candidates join by name — no account, no install. Late joiners get the current board instantly.",
            },
            {
              t: "Draw however you think",
              d: "Snap components and arrows, or grab the pen and sketch freehand on the same surface.",
            },
            {
              t: "Live cursors and presence",
              d: "See who is in the room and exactly where they are working, updated as it happens.",
            },
          ].map((f) => (
            <div key={f.t} className="panel p-6">
              <h3 className="text-base font-semibold">{f.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
