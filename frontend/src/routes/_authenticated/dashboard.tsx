import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api, type SessionRow } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Copy, LogOut, Plus, Trash2, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Interview sessions — Loopback" },
      {
        name: "description",
        content:
          "Create and manage shared system design interview boards, share join links and review past sessions.",
      },
      { property: "og:title", content: "Interview sessions — Loopback" },
      {
        property: "og:description",
        content: "Create and manage shared system design interview boards and join links.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function statusTone(status: string) {
  if (status === "live") return "bg-primary/15 text-primary border-primary/40";
  if (status === "completed") return "bg-muted text-muted-foreground border-border";
  return "bg-signal/15 text-signal border-signal/40";
}

function Dashboard() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [title, setTitle] = useState("System design interview");
  const [candidate, setCandidate] = useState("");
  const [role, setRole] = useState("");

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api.sessions.list(),
  });

  const createMut = useMutation({
    mutationFn: (v: { title: string; candidate_name: string; role_title: string }) =>
      api.sessions.create(v),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      setCandidate("");
      setRole("");
      toast.success("Session created!");
      navigate({ to: "/b/$token", params: { token: row.join_token } });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not create the session"),
  });

  const updateMut = useMutation({
    mutationFn: (v: { id: string; status?: "draft" | "live" | "completed"; link_revoked?: boolean }) =>
      api.sessions.update(v.id, v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not update the session"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.sessions.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Session deleted");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not delete session"),
  });

  function linkFor(s: SessionRow) {
    return `${window.location.origin}/b/${s.join_token}`;
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await api.auth.logout();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="relative min-h-screen">
      <div className="blueprint-grid pointer-events-none absolute inset-0 opacity-15" />
      <div className="relative mx-auto max-w-5xl px-6 py-10">
        <header className="flex items-center justify-between">
          <div>
            <p className="label-mono">Loopback</p>
            <h1 className="text-2xl font-semibold">Interview sessions</h1>
          </div>
          <Button variant="ghost" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </header>

        <section className="panel mt-8 p-6">
          <h2 className="text-sm font-semibold">New session</h2>
          <form
            className="mt-4 grid gap-4 md:grid-cols-[1.4fr_1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              createMut.mutate({ title, candidate_name: candidate, role_title: role });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="t">Title</Label>
              <Input id="t" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c">Candidate</Label>
              <Input id="c" value={candidate} onChange={(e) => setCandidate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r">Role</Label>
              <Input id="r" value={role} onChange={(e) => setRole(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={createMut.isPending}>
                <Plus className="mr-2 h-4 w-4" /> Create board
              </Button>
            </div>
          </form>
        </section>

        <section className="mt-8 space-y-3">
          {isLoading && <p className="label-mono">Loading…</p>}
          {!isLoading && sessions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No sessions yet. Create one above — you'll get a link to send the candidate.
            </p>
          )}
          {sessions.map((s) => (
            <article
              key={s.id}
              className="panel flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <h3 className="truncate text-base font-semibold">{s.title}</h3>
                  <Badge variant="outline" className={statusTone(s.status)}>
                    {s.link_revoked ? "revoked" : s.status}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[s.candidate_name, s.role_title].filter(Boolean).join(" · ") || "No candidate set"}
                </p>
                <p className="label-mono mt-2 truncate">/b/{s.join_token}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(linkFor(s));
                    toast.success("Join link copied");
                  }}
                >
                  <Copy className="mr-2 h-3.5 w-3.5" /> Copy link
                </Button>
                <Button size="sm" asChild>
                  <Link to="/b/$token" params={{ token: s.join_token }}>
                    <ExternalLink className="mr-2 h-3.5 w-3.5" /> Open board
                  </Link>
                </Button>
                {s.status !== "completed" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateMut.mutate({ id: s.id, status: "completed" })}
                  >
                    End
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateMut.mutate({ id: s.id, status: "live" })}
                  >
                    Reopen
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => updateMut.mutate({ id: s.id, link_revoked: !s.link_revoked })}
                >
                  {s.link_revoked ? "Restore link" : "Revoke link"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => {
                    if (confirm("Delete this session and its board?")) deleteMut.mutate(s.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
