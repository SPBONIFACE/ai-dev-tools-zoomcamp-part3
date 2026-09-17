import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, type BoardJoinResponse } from "@/lib/api";
import BoardCanvas from "@/components/board/BoardCanvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/b/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Interview Board — Loopback" },
      {
        name: "description",
        content: "Live system design interview board with collaborative canvas",
      },
      { property: "og:title", content: "Interview Board — Loopback" },
    ],
  }),
  component: BoardRoute,
});

function BoardRoute() {
  const { token } = Route.useParams();

  const [loading, setLoading] = useState(true);
  const [boardData, setBoardData] = useState<BoardJoinResponse | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [initialNotes, setInitialNotes] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [hasJoined, setHasJoined] = useState(false);
  const [inputName, setInputName] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadBoard() {
      setLoading(true);
      try {
        const joinRes = await api.boards.join(token);
        if (cancelled) return;
        setBoardData(joinRes);

        if (joinRes.found && !joinRes.revoked) {
          // Check if current user owns this session
          try {
            const ownedRes = await api.boards.getOwned(token);
            if (!cancelled && ownedRes.owned) {
              setIsOwner(true);
              setInitialNotes(ownedRes.session?.notes || "");
              setDisplayName("Interviewer");
              setHasJoined(true);
              setLoading(false);
              return;
            }
          } catch {
            // Not authenticated as owner, continue as candidate
          }

          // Check if candidate previously saved name in this session
          const savedName = sessionStorage.getItem(`join_name_${token}`);
          if (savedName) {
            setDisplayName(savedName);
            setHasJoined(true);
          } else if (joinRes.session?.candidate_name) {
            setInputName(joinRes.session.candidate_name);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setBoardData({ found: false, revoked: false, elements: [] });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadBoard();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <main className="relative flex min-h-screen items-center justify-center">
        <div className="blueprint-grid pointer-events-none absolute inset-0 opacity-20" />
        <div className="panel p-6 text-center">
          <p className="label-mono animate-pulse">Loading board...</p>
        </div>
      </main>
    );
  }

  if (!boardData || !boardData.found) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <div className="blueprint-grid pointer-events-none absolute inset-0 opacity-20" />
        <div className="panel max-w-md p-8">
          <p className="label-mono text-destructive">404</p>
          <h1 className="mt-2 text-2xl font-semibold">Session Not Found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This interview session link does not exist or has expired.
          </p>
          <Button asChild className="mt-6" variant="secondary">
            <Link to="/">Back to Home</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (boardData.revoked) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <div className="blueprint-grid pointer-events-none absolute inset-0 opacity-20" />
        <div className="panel max-w-md p-8">
          <p className="label-mono text-destructive">Access Revoked</p>
          <h1 className="mt-2 text-2xl font-semibold">Link Revoked</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The interviewer has revoked access to this interview link.
          </p>
          <Button asChild className="mt-6" variant="secondary">
            <Link to="/">Back to Home</Link>
          </Button>
        </div>
      </main>
    );
  }

  // Candidate Name Prompt Modal
  if (!hasJoined && !isOwner) {
    return (
      <main className="relative flex min-h-screen items-center justify-center px-4">
        <div className="blueprint-grid pointer-events-none absolute inset-0 opacity-25" />
        <div className="panel relative w-full max-w-md p-8">
          <p className="label-mono">Loopback</p>
          <h1 className="mt-2 text-2xl font-semibold">
            {boardData.session?.title || "System Design Interview"}
          </h1>
          {boardData.session?.role_title && (
            <p className="mt-1 text-sm text-muted-foreground">
              {boardData.session.role_title}
            </p>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const name = inputName.trim() || "Candidate";
              sessionStorage.setItem(`join_name_${token}`, name);
              setDisplayName(name);
              setHasJoined(true);
            }}
            className="mt-6 space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="candidateName">Your Name</Label>
              <Input
                id="candidateName"
                placeholder="Enter your name"
                required
                autoFocus
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full">
              Enter Board
            </Button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <BoardCanvas
      token={token}
      sessionId={boardData.session?.id || ""}
      title={boardData.session?.title || "System Design Interview"}
      subtitle={boardData.session?.role_title || ""}
      initialElements={boardData.elements || []}
      readOnly={boardData.session?.status === "completed"}
      isOwner={isOwner}
      initialNotes={initialNotes}
      displayName={displayName || "Candidate"}
    />
  );
}
