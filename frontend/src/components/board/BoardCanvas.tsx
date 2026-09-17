import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  MousePointer2,
  Pencil,
  Eraser,
  Type as TypeIcon,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Download,
  Trash2,
  Copy,
  NotebookPen,
  Hand,
} from "lucide-react";
import { api } from "@/lib/api";
import { pushOps } from "@/lib/board.functions";
import { updateSession } from "@/lib/sessions.functions";
import {
  SHAPES,
  SHAPE_MAP,
  PALETTE_COLORS,
  anchorPoint,
  colorForName,
  nodeCenter,
  uid,
  type BoardEl,
  type BoardOp,
  type ColorKey,
  type DrawEl,
  type EdgeEl,
  type NodeEl,
  type TextEl,
} from "@/lib/board-types";
import { NodeBody, ShapeGlyph } from "./shapes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Tool = "select" | "pan" | "pen" | "eraser" | "text";

type Drag =
  | { mode: "pan"; sx: number; sy: number; cx: number; cy: number }
  | { mode: "move"; ids: string[]; wx: number; wy: number; orig: Record<string, { x: number; y: number }> }
  | { mode: "resize"; id: string; wx: number; wy: number; w: number; h: number }
  | { mode: "pen"; pts: number[] }
  | { mode: "edge"; from: string; x: number; y: number }
  | { mode: "marquee"; x0: number; y0: number; x1: number; y1: number }
  | null;

interface Peer {
  id: string;
  name: string;
  color: string;
  isOwner: boolean;
  x?: number;
  y?: number;
}

export interface BoardCanvasProps {
  token: string;
  sessionId: string;
  title: string;
  subtitle: string;
  initialElements: BoardEl[];
  readOnly: boolean;
  isOwner: boolean;
  initialNotes: string;
  displayName: string;
}

export default function BoardCanvas(props: BoardCanvasProps) {
  const { token, readOnly, isOwner, displayName } = props;
  const send = useServerFn(pushOps);
  const saveSession = useServerFn(updateSession);

  const [els, setEls] = useState<Record<string, BoardEl>>(() =>
    Object.fromEntries(props.initialElements.map((e) => [e.id, e])),
  );
  const [selection, setSelection] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [penColor, setPenColor] = useState<ColorKey>("node-service");
  const [penWidth, setPenWidth] = useState(3);
  const [cam, setCam] = useState({ x: 0, y: 0, k: 1 });
  const [drag, setDrag] = useState<Drag>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [notes, setNotes] = useState(props.initialNotes);
  const [notesOpen, setNotesOpen] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sendWs = useCallback((msg: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);
  const pendingRef = useRef<Map<string, BoardOp>>(new Map());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoRef = useRef<Record<string, BoardEl>[]>([]);
  const redoRef = useRef<Record<string, BoardEl>[]>([]);
  const lastCursor = useRef(0);
  const myId = useMemo(() => uid(), []);
  const myColor = useMemo(() => colorForName(displayName + myId), [displayName, myId]);

  /* ---------------- geometry ---------------- */

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const r = svgRef.current?.getBoundingClientRect();
      if (!r) return { x: 0, y: 0 };
      return { x: (clientX - r.left - cam.x) / cam.k, y: (clientY - r.top - cam.y) / cam.k };
    },
    [cam],
  );

  const nodes = useMemo(
    () => Object.values(els).filter((e): e is NodeEl => e.kind === "node"),
    [els],
  );

  const nodeAt = useCallback(
    (x: number, y: number) => {
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h) return n;
      }
      return null;
    },
    [nodes],
  );

  /* ---------------- ops ---------------- */

  const queue = useCallback(
    (ops: BoardOp[]) => {
      if (readOnly) return;
      for (const op of ops) pendingRef.current.set(op.type === "upsert" ? op.el.id : op.id, op);
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flushTimer.current = setTimeout(async () => {
        const batch = Array.from(pendingRef.current.values());
        pendingRef.current.clear();
        if (!batch.length) return;
        try {
          await send({ data: { token, ops: batch } });
        } catch {
          toast.error("Changes could not be saved");
        }
      }, 700);
    },
    [readOnly, send, token],
  );

  const applyOps = useCallback((ops: BoardOp[]) => {
    setEls((prev) => {
      const next = { ...prev };
      for (const op of ops) {
        if (op.type === "upsert") next[op.el.id] = op.el;
        else delete next[op.id];
      }
      return next;
    });
  }, []);

  const snapshot = useCallback(() => {
    undoRef.current.push(els);
    if (undoRef.current.length > 60) undoRef.current.shift();
    redoRef.current = [];
  }, [els]);

  const commit = useCallback(
    (ops: BoardOp[], opts?: { history?: boolean }) => {
      if (readOnly || !ops.length) return;
      if (opts?.history !== false) snapshot();
      applyOps(ops);
      queue(ops);
      sendWs({ type: "broadcast", event: "ops", payload: { ops, by: myId } });
    },
    [applyOps, myId, queue, readOnly, sendWs, snapshot],
  );

  const restore = useCallback(
    (target: Record<string, BoardEl>, current: Record<string, BoardEl>) => {
      const ops: BoardOp[] = [];
      for (const id of Object.keys(current)) if (!target[id]) ops.push({ type: "delete", id });
      for (const el of Object.values(target)) if (current[el.id] !== el) ops.push({ type: "upsert", el });
      if (!ops.length) return;
      applyOps(ops);
      queue(ops);
      sendWs({ type: "broadcast", event: "ops", payload: { ops, by: myId } });
    },
    [applyOps, myId, queue, sendWs],
  );

  const undo = useCallback(() => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    redoRef.current.push(els);
    restore(prev, els);
    setSelection([]);
  }, [els, restore]);

  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(els);
    restore(next, els);
    setSelection([]);
  }, [els, restore]);

  /* ---------------- realtime ---------------- */

  useEffect(() => {
    let ws: WebSocket;
    try {
      ws = api.boards.createWebSocket(token, displayName, isOwner ? "interviewer" : "candidate");
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "broadcast" && data.event === "ops" && data.payload?.ops) {
            applyOps(data.payload.ops);
          } else if (data.type === "board_ops" && data.ops) {
            applyOps(data.ops);
          } else if (data.type === "broadcast" && data.event === "cursor" && data.payload) {
            const p = data.payload;
            if (p.id === myId) return;
            setPeers((prev) => {
              const existing = prev.find((q) => q.id === p.id);
              if (existing) {
                return prev.map((q) => (q.id === p.id ? { ...q, x: p.x, y: p.y } : q));
              }
              return [
                ...prev,
                {
                  id: p.id,
                  name: p.name || "Participant",
                  color: p.color || colorForName(p.id),
                  isOwner: !!p.isOwner,
                  x: p.x,
                  y: p.y,
                },
              ];
            });
          } else if (data.type === "presence") {
            if (data.action === "join" && data.participant) {
              const pName = data.participant.name || "Participant";
              setPeers((prev) => {
                if (prev.some((q) => q.name === pName)) return prev;
                return [
                  ...prev,
                  {
                    id: pName,
                    name: pName,
                    color: colorForName(pName),
                    isOwner: data.participant.role === "interviewer",
                  },
                ];
              });
            } else if (data.action === "leave" && data.participant) {
              const pName = data.participant.name;
              setPeers((prev) => prev.filter((q) => q.name !== pName));
            }
          }
        } catch (err) {
          console.error("Error processing websocket message:", err);
        }
      };
    } catch (err) {
      console.error("Failed to connect websocket:", err);
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [applyOps, displayName, isOwner, myId, token]);

  /* ---------------- pointer interaction ---------------- */

  function onPointerDownCanvas(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button === 1 || tool === "pan" || (tool === "select" && e.altKey)) {
      setDrag({ mode: "pan", sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y });
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    if (tool === "pen" && !readOnly) {
      setDrag({ mode: "pen", pts: [w.x, w.y] });
      return;
    }
    if (tool === "text" && !readOnly) {
      const el: TextEl = {
        id: uid(),
        kind: "text",
        x: w.x,
        y: w.y,
        text: "Text",
        color: "node-external",
        size: 18,
      };
      commit([{ type: "upsert", el }]);
      setSelection([el.id]);
      setTool("select");
      return;
    }
    if (tool === "select") {
      if (e.shiftKey) {
        setDrag({ mode: "marquee", x0: w.x, y0: w.y, x1: w.x, y1: w.y });
      } else {
        setSelection([]);
        setDrag({ mode: "pan", sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y });
      }
    }
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const w = toWorld(e.clientX, e.clientY);
    const now = Date.now();
    if (now - lastCursor.current > 45) {
      lastCursor.current = now;
      sendWs({
        type: "broadcast",
        event: "cursor",
        payload: { id: myId, name: displayName, color: myColor, isOwner, x: w.x, y: w.y },
      });
    }
    if (!drag) return;

    if (drag.mode === "pan") {
      setCam((c) => ({ ...c, x: drag.cx + (e.clientX - drag.sx), y: drag.cy + (e.clientY - drag.sy) }));
    } else if (drag.mode === "move") {
      const dx = w.x - drag.wx;
      const dy = w.y - drag.wy;
      setEls((prev) => {
        const next = { ...prev };
        for (const id of drag.ids) {
          const el = next[id];
          const o = drag.orig[id];
          if (!el || !o) continue;
          if (el.kind === "node" || el.kind === "text") next[id] = { ...el, x: o.x + dx, y: o.y + dy };
          else if (el.kind === "draw") {
            const pts = el.points.map((v, i) => (i % 2 === 0 ? v + dx - 0 : v + dy));
            next[id] = { ...el, points: pts };
          }
        }
        return next;
      });
      setDrag({ ...drag, wx: w.x, wy: w.y, orig: Object.fromEntries(drag.ids.map((id) => {
        const el = els[id];
        if (el && (el.kind === "node" || el.kind === "text")) return [id, { x: el.x, y: el.y }];
        return [id, drag.orig[id] ?? { x: 0, y: 0 }];
      })) });
    } else if (drag.mode === "resize") {
      const el = els[drag.id];
      if (el && el.kind === "node") {
        const nw = Math.max(70, drag.w + (w.x - drag.wx));
        const nh = Math.max(50, drag.h + (w.y - drag.wy));
        setEls((prev) => ({ ...prev, [drag.id]: { ...el, w: nw, h: nh } }));
      }
    } else if (drag.mode === "pen") {
      setDrag({ mode: "pen", pts: [...drag.pts, w.x, w.y] });
    } else if (drag.mode === "edge") {
      setDrag({ ...drag, x: w.x, y: w.y });
    } else if (drag.mode === "marquee") {
      setDrag({ ...drag, x1: w.x, y1: w.y });
    }
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const w = toWorld(e.clientX, e.clientY);
    if (!drag) return;

    if (drag.mode === "move" || drag.mode === "resize") {
      const ids = drag.mode === "move" ? drag.ids : [drag.id];
      commit(ids.map((id) => ({ type: "upsert", el: els[id]! })).filter((o) => o.el));
    } else if (drag.mode === "pen" && drag.pts.length > 3) {
      const el: DrawEl = {
        id: uid(),
        kind: "draw",
        points: drag.pts,
        color: penColor,
        width: penWidth,
      };
      commit([{ type: "upsert", el }]);
    } else if (drag.mode === "edge") {
      const target = nodeAt(w.x, w.y);
      if (target && target.id !== drag.from) {
        const el: EdgeEl = {
          id: uid(),
          kind: "edge",
          from: drag.from,
          to: target.id,
          style: "solid",
          arrow: "end",
          label: "",
          color: "node-external",
        };
        commit([{ type: "upsert", el }]);
        setSelection([el.id]);
      }
    } else if (drag.mode === "marquee") {
      const x0 = Math.min(drag.x0, drag.x1);
      const x1 = Math.max(drag.x0, drag.x1);
      const y0 = Math.min(drag.y0, drag.y1);
      const y1 = Math.max(drag.y0, drag.y1);
      const hits = Object.values(els)
        .filter((el) => {
          if (el.kind === "node") return el.x >= x0 && el.y >= y0 && el.x + el.w <= x1 && el.y + el.h <= y1;
          if (el.kind === "text") return el.x >= x0 && el.x <= x1 && el.y >= y0 && el.y <= y1;
          if (el.kind === "draw")
            return el.points.every((v, i) => (i % 2 === 0 ? v >= x0 && v <= x1 : v >= y0 && v <= y1));
          return false;
        })
        .map((el) => el.id);
      setSelection(hits);
    }
    setDrag(null);
  }

  function startMove(e: React.PointerEvent, id: string) {
    if (readOnly || tool === "pen" || tool === "pan") return;
    e.stopPropagation();
    if (tool === "eraser") {
      commit([{ type: "delete", id }, ...edgesTouching(id)]);
      return;
    }
    const ids = selection.includes(id) ? selection : [id];
    setSelection(ids);
    const w = toWorld(e.clientX, e.clientY);
    const orig: Record<string, { x: number; y: number }> = {};
    for (const i of ids) {
      const el = els[i];
      if (el && (el.kind === "node" || el.kind === "text")) orig[i] = { x: el.x, y: el.y };
      else orig[i] = { x: 0, y: 0 };
    }
    snapshot();
    setDrag({ mode: "move", ids, wx: w.x, wy: w.y, orig });
  }

  function edgesTouching(id: string): BoardOp[] {
    return Object.values(els)
      .filter((el): el is EdgeEl => el.kind === "edge" && (el.from === id || el.to === id))
      .map((el) => ({ type: "delete" as const, id: el.id }));
  }

  /* ---------------- element creation ---------------- */

  function addShape(shapeKey: NodeEl["shape"]) {
    if (readOnly) return;
    const spec = SHAPE_MAP[shapeKey];
    const r = svgRef.current?.getBoundingClientRect();
    const cx = r ? (r.width / 2 - cam.x) / cam.k : 0;
    const cy = r ? (r.height / 2 - cam.y) / cam.k : 0;
    const jitter = Object.keys(els).length % 5;
    const el: NodeEl = {
      id: uid(),
      kind: "node",
      shape: shapeKey,
      x: Math.round(cx - spec.w / 2 + jitter * 22),
      y: Math.round(cy - spec.h / 2 + jitter * 18),
      w: spec.w,
      h: spec.h,
      label: spec.name,
      sub: spec.sub,
      color: spec.color,
    };
    commit([{ type: "upsert", el }]);
    setSelection([el.id]);
    setTool("select");
  }

  function deleteSelection() {
    if (!selection.length) return;
    const ops: BoardOp[] = [];
    for (const id of selection) {
      ops.push({ type: "delete", id });
      ops.push(...edgesTouching(id));
    }
    commit(ops);
    setSelection([]);
  }

  function patchSelected(patch: Partial<NodeEl & EdgeEl & TextEl & DrawEl>) {
    const ops: BoardOp[] = selection
      .map((id) => els[id])
      .filter(Boolean)
      .map((el) => ({ type: "upsert" as const, el: { ...el, ...patch } as BoardEl }));
    commit(ops);
  }

  /* ---------------- keyboard ---------------- */

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelection();
      }
      if (e.key === "v") setTool("select");
      if (e.key === "h") setTool("pan");
      if (e.key === "p") setTool("pen");
      if (e.key === "e") setTool("eraser");
      if (e.key === "t") setTool("text");
      if (e.key === "Escape") setSelection([]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---------------- view helpers ---------------- */

  function zoom(factor: number) {
    const r = svgRef.current?.getBoundingClientRect();
    const cx = (r?.width ?? 800) / 2;
    const cy = (r?.height ?? 600) / 2;
    setCam((c) => {
      const k = Math.min(3, Math.max(0.2, c.k * factor));
      return { k, x: cx - ((cx - c.x) / c.k) * k, y: cy - ((cy - c.y) / c.k) * k };
    });
  }

  function fitView() {
    const all = Object.values(els);
    const r = svgRef.current?.getBoundingClientRect();
    if (!all.length || !r) {
      setCam({ x: 0, y: 0, k: 1 });
      return;
    }
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const el of all) {
      if (el.kind === "node") {
        minX = Math.min(minX, el.x);
        minY = Math.min(minY, el.y);
        maxX = Math.max(maxX, el.x + el.w);
        maxY = Math.max(maxY, el.y + el.h);
      } else if (el.kind === "text") {
        minX = Math.min(minX, el.x);
        minY = Math.min(minY, el.y - el.size);
        maxX = Math.max(maxX, el.x + el.text.length * el.size * 0.6);
        maxY = Math.max(maxY, el.y);
      } else if (el.kind === "draw") {
        for (let i = 0; i < el.points.length; i += 2) {
          minX = Math.min(minX, el.points[i]);
          maxX = Math.max(maxX, el.points[i]);
          minY = Math.min(minY, el.points[i + 1]);
          maxY = Math.max(maxY, el.points[i + 1]);
        }
      }
    }
    if (!isFinite(minX)) return;
    const pad = 80;
    const k = Math.min(2, Math.max(0.2, Math.min(r.width / (maxX - minX + pad * 2), r.height / (maxY - minY + pad * 2))));
    setCam({ k, x: r.width / 2 - ((minX + maxX) / 2) * k, y: r.height / 2 - ((minY + maxY) / 2) * k });
  }

  function exportPng() {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll("[data-export-hide]").forEach((n) => n.remove());
    const styles = getComputedStyle(document.documentElement);
    let markup = new XMLSerializer().serializeToString(clone);
    markup = markup.replace(/var\(--([a-z0-9-]+)\)/gi, (_m, name: string) =>
      (styles.getPropertyValue(`--${name}`) || "#888").trim(),
    );
    markup = markup.replace(/color-mix\([^)]*\)/gi, "#2a3444");
    const rect = svg.getBoundingClientRect();
    const img = new Image();
    const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = rect.width * 2;
      canvas.height = rect.height * 2;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = (styles.getPropertyValue("--background") || "#111").trim();
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const a = document.createElement("a");
      a.download = `${props.title.replace(/\s+/g, "-").toLowerCase()}-board.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.onerror = () => toast.error("Export failed");
    img.src = url;
  }

  async function persistNotes(value: string) {
    setNotes(value);
    if (!isOwner) return;
    try {
      await saveSession({ data: { id: props.sessionId, notes: value } });
    } catch {
      /* autosave retries on next keystroke */
    }
  }

  /* ---------------- render ---------------- */

  const selected = selection.length === 1 ? els[selection[0]] : undefined;
  const edges = Object.values(els).filter((e): e is EdgeEl => e.kind === "edge");
  const draws = Object.values(els).filter((e): e is DrawEl => e.kind === "draw");
  const texts = Object.values(els).filter((e): e is TextEl => e.kind === "text");

  const cursorClass =
    tool === "pen" ? "cursor-crosshair" : tool === "pan" ? "cursor-grab" : tool === "eraser" ? "cursor-cell" : "cursor-default";

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      {/* top bar */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-2">
        <Link to="/" className="label-mono shrink-0 hover:text-foreground">
          Loopback
        </Link>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{props.title}</p>
          <p className="label-mono truncate">{props.subtitle}</p>
        </div>

        <div className="ml-4 flex items-center gap-1">
          <ToolButton active={tool === "select"} onClick={() => setTool("select")} label="Select (V)">
            <MousePointer2 className="h-4 w-4" />
          </ToolButton>
          <ToolButton active={tool === "pan"} onClick={() => setTool("pan")} label="Pan (H)">
            <Hand className="h-4 w-4" />
          </ToolButton>
          <ToolButton active={tool === "pen"} onClick={() => setTool("pen")} label="Pen (P)" disabled={readOnly}>
            <Pencil className="h-4 w-4" />
          </ToolButton>
          <ToolButton active={tool === "eraser"} onClick={() => setTool("eraser")} label="Eraser (E)" disabled={readOnly}>
            <Eraser className="h-4 w-4" />
          </ToolButton>
          <ToolButton active={tool === "text"} onClick={() => setTool("text")} label="Text (T)" disabled={readOnly}>
            <TypeIcon className="h-4 w-4" />
          </ToolButton>
          <span className="mx-1 h-5 w-px bg-border" />
          <ToolButton onClick={undo} label="Undo" disabled={readOnly}>
            <Undo2 className="h-4 w-4" />
          </ToolButton>
          <ToolButton onClick={redo} label="Redo" disabled={readOnly}>
            <Redo2 className="h-4 w-4" />
          </ToolButton>
          <span className="mx-1 h-5 w-px bg-border" />
          <ToolButton onClick={() => zoom(1.2)} label="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </ToolButton>
          <ToolButton onClick={() => zoom(1 / 1.2)} label="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </ToolButton>
          <ToolButton onClick={fitView} label="Zoom to fit">
            <Maximize className="h-4 w-4" />
          </ToolButton>
          <ToolButton onClick={exportPng} label="Export PNG">
            <Download className="h-4 w-4" />
          </ToolButton>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex -space-x-2">
            <Avatar name={displayName} color={myColor} you />
            {peers.map((p) => (
              <Avatar key={p.id} name={p.name} color={p.color} />
            ))}
          </div>
          {isOwner && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/b/${token}`);
                  toast.success("Join link copied");
                }}
              >
                <Copy className="mr-2 h-3.5 w-3.5" /> Invite
              </Button>
              <Button
                variant={notesOpen ? "default" : "ghost"}
                size="sm"
                onClick={() => setNotesOpen((v) => !v)}
              >
                <NotebookPen className="mr-2 h-3.5 w-3.5" /> Notes
              </Button>
            </>
          )}
          {readOnly && <span className="label-mono text-signal">Read only</span>}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* palette */}
        {!readOnly && (
          <aside className="w-52 shrink-0 overflow-y-auto border-r border-border bg-sidebar p-3">
            <p className="label-mono px-1">Components</p>
            <div className="mt-2 space-y-1">
              {SHAPES.map((s) => (
                <button
                  key={s.key}
                  onClick={() => addShape(s.key)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-sidebar-accent"
                >
                  <ShapeGlyph shape={s.key} color={s.color} />
                  <span className="truncate">{s.name}</span>
                </button>
              ))}
            </div>

            <p className="label-mono mt-5 px-1">Pen</p>
            <div className="mt-2 flex flex-wrap gap-1.5 px-1">
              {PALETTE_COLORS.map((c) => (
                <button
                  key={c}
                  aria-label={c}
                  onClick={() => setPenColor(c)}
                  className={cn(
                    "h-6 w-6 rounded-full border-2",
                    penColor === c ? "border-foreground" : "border-transparent",
                  )}
                  style={{ backgroundColor: `var(--${c})` }}
                />
              ))}
            </div>
            <div className="mt-3 flex gap-1.5 px-1">
              {[2, 3, 5, 8].map((wd) => (
                <button
                  key={wd}
                  onClick={() => setPenWidth(wd)}
                  className={cn(
                    "flex h-7 w-9 items-center justify-center rounded-md border",
                    penWidth === wd ? "border-primary bg-accent" : "border-border",
                  )}
                >
                  <span
                    className="block rounded-full bg-foreground"
                    style={{ width: wd + 4, height: wd }}
                  />
                </button>
              ))}
            </div>
          </aside>
        )}

        {/* canvas */}
        <div className="relative min-w-0 flex-1">
          <svg
            ref={svgRef}
            className={cn("h-full w-full touch-none select-none", cursorClass)}
            onPointerDown={onPointerDownCanvas}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => setDrag(null)}
            onWheel={(e) => {
              const r = svgRef.current!.getBoundingClientRect();
              const mx = e.clientX - r.left;
              const my = e.clientY - r.top;
              setCam((c) => {
                const k = Math.min(3, Math.max(0.2, c.k * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
                return { k, x: mx - ((mx - c.x) / c.k) * k, y: my - ((my - c.y) / c.k) * k };
              });
            }}
          >
            <defs>
              <pattern id="grid" width={28} height={28} patternUnits="userSpaceOnUse">
                <path d="M28 0 H0 V28" fill="none" stroke="var(--grid)" strokeWidth="1" opacity="0.5" />
              </pattern>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" fill="var(--node-external)" />
              </marker>
            </defs>

            <rect
              data-export-hide
              x={0}
              y={0}
              width="100%"
              height="100%"
              fill="url(#grid)"
              opacity={0.45}
            />

            <g transform={`translate(${cam.x} ${cam.y}) scale(${cam.k})`}>
              {/* edges */}
              {edges.map((e) => {
                const a = els[e.from];
                const b = els[e.to];
                if (!a || !b || a.kind !== "node" || b.kind !== "node") return null;
                const ca = nodeCenter(a);
                const cb = nodeCenter(b);
                const p1 = anchorPoint(a, cb.x, cb.y);
                const p2 = anchorPoint(b, ca.x, ca.y);
                const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
                const sel = selection.includes(e.id);
                return (
                  <g key={e.id} onPointerDown={(ev) => {
                    ev.stopPropagation();
                    if (tool === "eraser" && !readOnly) commit([{ type: "delete", id: e.id }]);
                    else setSelection([e.id]);
                  }}>
                    <line
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      style={{
                        stroke: sel ? "var(--primary)" : `var(--${e.color})`,
                        strokeWidth: 2,
                        strokeDasharray: e.style === "dashed" ? "8 6" : undefined,
                      }}
                      markerEnd={e.arrow !== "none" ? "url(#arrow)" : undefined}
                      markerStart={e.arrow === "both" ? "url(#arrow)" : undefined}
                    />
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth={14} />
                    {e.label && (
                      <text
                        x={mid.x}
                        y={mid.y - 8}
                        textAnchor="middle"
                        style={{ fill: "var(--foreground)", fontSize: 12, fontFamily: "var(--font-mono)" }}
                      >
                        {e.label}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* freehand */}
              {draws.map((d) => {
                const path = d.points.reduce(
                  (acc, v, i) => (i % 2 === 0 ? `${acc} ${i === 0 ? "M" : "L"} ${v}` : `${acc} ${v}`),
                  "",
                );
                const sel = selection.includes(d.id);
                return (
                  <path
                    key={d.id}
                    d={path}
                    style={{
                      fill: "none",
                      stroke: sel ? "var(--primary)" : `var(--${d.color})`,
                      strokeWidth: d.width,
                      strokeLinecap: "round",
                      strokeLinejoin: "round",
                    }}
                    onPointerDown={(ev) => {
                      if (tool === "pen") return;
                      ev.stopPropagation();
                      if (tool === "eraser" && !readOnly) commit([{ type: "delete", id: d.id }]);
                      else startMove(ev, d.id);
                    }}
                  />
                );
              })}

              {/* nodes */}
              {nodes.map((n) => {
                const sel = selection.includes(n.id);
                const spec = SHAPE_MAP[n.shape] ?? SHAPE_MAP["service"];
                return (
                  <g key={n.id} transform={`translate(${n.x} ${n.y})`} onPointerDown={(ev) => startMove(ev, n.id)}>
                    <NodeBody el={n} />
                    <text
                      x={n.w / 2}
                      y={spec.form === "note" ? 28 : n.h / 2 + (n.sub ? -2 : 4)}
                      textAnchor="middle"
                      style={{ fill: "var(--foreground)", fontSize: 13, fontWeight: 600, pointerEvents: "none" }}
                    >
                      {n.label}
                    </text>
                    {n.sub && (
                      <text
                        x={n.w / 2}
                        y={spec.form === "note" ? 46 : n.h / 2 + 15}
                        textAnchor="middle"
                        style={{
                          fill: "var(--muted-foreground)",
                          fontSize: 10.5,
                          fontFamily: "var(--font-mono)",
                          pointerEvents: "none",
                        }}
                      >
                        {n.sub}
                      </text>
                    )}
                    {sel && (
                      <rect
                        x={-6}
                        y={-6}
                        width={n.w + 12}
                        height={n.h + 12}
                        rx={8}
                        style={{ fill: "none", stroke: "var(--primary)", strokeWidth: 1.5, strokeDasharray: "4 4" }}
                      />
                    )}
                    {sel && !readOnly && (
                      <>
                        <rect
                          data-export-hide
                          x={n.w}
                          y={n.h}
                          width={12}
                          height={12}
                          rx={2}
                          style={{ fill: "var(--primary)", cursor: "nwse-resize" }}
                          onPointerDown={(ev) => {
                            ev.stopPropagation();
                            const w = toWorld(ev.clientX, ev.clientY);
                            snapshot();
                            setDrag({ mode: "resize", id: n.id, wx: w.x, wy: w.y, w: n.w, h: n.h });
                          }}
                        />
                        {[
                          { x: n.w + 12, y: n.h / 2 },
                          { x: -12, y: n.h / 2 },
                          { x: n.w / 2, y: -12 },
                          { x: n.w / 2, y: n.h + 12 },
                        ].map((p, i) => (
                          <circle
                            key={i}
                            data-export-hide
                            cx={p.x}
                            cy={p.y}
                            r={6}
                            style={{ fill: "var(--signal)", cursor: "crosshair" }}
                            onPointerDown={(ev) => {
                              ev.stopPropagation();
                              const w = toWorld(ev.clientX, ev.clientY);
                              setDrag({ mode: "edge", from: n.id, x: w.x, y: w.y });
                            }}
                          />
                        ))}
                      </>
                    )}
                  </g>
                );
              })}

              {/* free text */}
              {texts.map((t) => (
                <text
                  key={t.id}
                  x={t.x}
                  y={t.y}
                  style={{
                    fill: selection.includes(t.id) ? "var(--primary)" : `var(--${t.color})`,
                    fontSize: t.size,
                    cursor: "move",
                  }}
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    if (tool === "eraser" && !readOnly) commit([{ type: "delete", id: t.id }]);
                    else startMove(ev, t.id);
                  }}
                >
                  {t.text}
                </text>
              ))}

              {/* live previews */}
              {drag?.mode === "pen" && (
                <path
                  d={drag.pts.reduce(
                    (acc, v, i) => (i % 2 === 0 ? `${acc} ${i === 0 ? "M" : "L"} ${v}` : `${acc} ${v}`),
                    "",
                  )}
                  style={{
                    fill: "none",
                    stroke: `var(--${penColor})`,
                    strokeWidth: penWidth,
                    strokeLinecap: "round",
                  }}
                />
              )}
              {drag?.mode === "edge" && els[drag.from]?.kind === "node" && (
                <line
                  x1={nodeCenter(els[drag.from] as NodeEl).x}
                  y1={nodeCenter(els[drag.from] as NodeEl).y}
                  x2={drag.x}
                  y2={drag.y}
                  style={{ stroke: "var(--signal)", strokeWidth: 2, strokeDasharray: "6 5" }}
                />
              )}
              {drag?.mode === "marquee" && (
                <rect
                  x={Math.min(drag.x0, drag.x1)}
                  y={Math.min(drag.y0, drag.y1)}
                  width={Math.abs(drag.x1 - drag.x0)}
                  height={Math.abs(drag.y1 - drag.y0)}
                  style={{ fill: "var(--primary)", opacity: 0.12, stroke: "var(--primary)" }}
                />
              )}

              {/* peer cursors */}
              {peers
                .filter((p) => p.x !== undefined)
                .map((p) => (
                  <g key={p.id} data-export-hide transform={`translate(${p.x} ${p.y})`}>
                    <path d="M0 0 L0 14 L4 11 L7 17 L10 15 L7 9 L12 9 Z" fill={p.color} />
                    <text x={14} y={16} style={{ fill: p.color, fontSize: 11, fontFamily: "var(--font-mono)" }}>
                      {p.name}
                    </text>
                  </g>
                ))}
            </g>
          </svg>

          {/* selection inspector */}
          {selected && !readOnly && (
            <div className="panel absolute right-4 top-4 w-64 space-y-3 p-4">
              <div className="flex items-center justify-between">
                <p className="label-mono">{selected.kind}</p>
                <Button variant="ghost" size="sm" onClick={deleteSelection}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {selected.kind === "node" && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="lbl">Label</Label>
                    <Input
                      id="lbl"
                      value={selected.label}
                      onChange={(e) => patchSelected({ label: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sub">Detail</Label>
                    <Input
                      id="sub"
                      value={selected.sub}
                      placeholder="Postgres, 3 replicas"
                      onChange={(e) => patchSelected({ sub: e.target.value })}
                    />
                  </div>
                </>
              )}

              {selected.kind === "edge" && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="elbl">Arrow label</Label>
                    <Input
                      id="elbl"
                      value={selected.label}
                      placeholder="write path, 10k rps"
                      onChange={(e) => patchSelected({ label: e.target.value })}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={selected.style === "solid" ? "default" : "secondary"}
                      onClick={() => patchSelected({ style: "solid" })}
                    >
                      Solid
                    </Button>
                    <Button
                      size="sm"
                      variant={selected.style === "dashed" ? "default" : "secondary"}
                      onClick={() => patchSelected({ style: "dashed" })}
                    >
                      Dashed
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    {(["end", "both", "none"] as const).map((a) => (
                      <Button
                        key={a}
                        size="sm"
                        variant={selected.arrow === a ? "default" : "secondary"}
                        onClick={() => patchSelected({ arrow: a })}
                      >
                        {a}
                      </Button>
                    ))}
                  </div>
                </>
              )}

              {selected.kind === "text" && (
                <div className="space-y-1.5">
                  <Label htmlFor="txt">Text</Label>
                  <Input
                    id="txt"
                    value={selected.text}
                    onChange={(e) => patchSelected({ text: e.target.value })}
                  />
                </div>
              )}

              <div>
                <Label className="mb-1.5 block">Colour</Label>
                <div className="flex flex-wrap gap-1.5">
                  {PALETTE_COLORS.map((c) => (
                    <button
                      key={c}
                      aria-label={c}
                      onClick={() => patchSelected({ color: c })}
                      className={cn(
                        "h-6 w-6 rounded-full border-2",
                        selected.color === c ? "border-foreground" : "border-transparent",
                      )}
                      style={{ backgroundColor: `var(--${c})` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* interviewer notes */}
          {isOwner && notesOpen && (
            <div className="panel absolute bottom-4 right-4 w-80 p-4">
              <div className="flex items-center justify-between">
                <p className="label-mono">Private notes</p>
                <span className="label-mono">only you</span>
              </div>
              <Textarea
                className="mt-2 h-48 resize-none"
                value={notes}
                placeholder="Signals, follow-up questions, scoring…"
                onChange={(e) => persistNotes(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  children,
  onClick,
  active,
  label,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      {children}
    </button>
  );
}

function Avatar({ name, color, you }: { name: string; color: string; you?: boolean }) {
  return (
    <span
      title={you ? `${name} (you)` : name}
      className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface text-[11px] font-semibold"
      style={{ backgroundColor: color, color: "#12202b" }}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}
