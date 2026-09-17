export type ColorKey =
  | "node-service"
  | "node-data"
  | "node-flow"
  | "node-edge-net"
  | "node-ai"
  | "node-external"
  | "node-note";

export type ShapeKey =
  | "client"
  | "service"
  | "database"
  | "cache"
  | "queue"
  | "loadbalancer"
  | "gateway"
  | "cdn"
  | "storage"
  | "llm"
  | "external"
  | "group"
  | "note";

export interface ShapeSpec {
  key: ShapeKey;
  name: string;
  sub: string;
  color: ColorKey;
  w: number;
  h: number;
  /** visual family used by the renderer */
  form: "box" | "cylinder" | "pipe" | "hex" | "cloud" | "group" | "note";
}

export const SHAPES: ShapeSpec[] = [
  { key: "client", name: "Client", sub: "web / mobile", color: "node-service", w: 150, h: 74, form: "box" },
  { key: "service", name: "Service", sub: "", color: "node-service", w: 160, h: 80, form: "box" },
  { key: "gateway", name: "API Gateway", sub: "", color: "node-edge-net", w: 160, h: 74, form: "hex" },
  { key: "loadbalancer", name: "Load Balancer", sub: "", color: "node-edge-net", w: 160, h: 74, form: "hex" },
  { key: "database", name: "Database", sub: "Postgres", color: "node-data", w: 150, h: 96, form: "cylinder" },
  { key: "cache", name: "Cache", sub: "Redis", color: "node-data", w: 140, h: 92, form: "cylinder" },
  { key: "queue", name: "Queue", sub: "Kafka / SQS", color: "node-flow", w: 170, h: 70, form: "pipe" },
  { key: "storage", name: "Object Store", sub: "S3", color: "node-data", w: 150, h: 92, form: "cylinder" },
  { key: "cdn", name: "CDN", sub: "edge cache", color: "node-edge-net", w: 140, h: 76, form: "cloud" },
  { key: "llm", name: "LLM", sub: "model call", color: "node-ai", w: 150, h: 80, form: "box" },
  { key: "external", name: "External API", sub: "third party", color: "node-external", w: 160, h: 74, form: "cloud" },
  { key: "group", name: "Boundary", sub: "region / VPC", color: "node-external", w: 320, h: 220, form: "group" },
  { key: "note", name: "Sticky note", sub: "", color: "node-note", w: 160, h: 120, form: "note" },
];

export const SHAPE_MAP: Record<ShapeKey, ShapeSpec> = Object.fromEntries(
  SHAPES.map((s) => [s.key, s]),
) as Record<ShapeKey, ShapeSpec>;

export const PALETTE_COLORS: ColorKey[] = [
  "node-service",
  "node-data",
  "node-flow",
  "node-edge-net",
  "node-ai",
  "node-external",
  "node-note",
];

export interface NodeEl {
  id: string;
  kind: "node";
  shape: ShapeKey;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sub: string;
  color: ColorKey;
}

export interface EdgeEl {
  id: string;
  kind: "edge";
  from: string;
  to: string;
  style: "solid" | "dashed";
  arrow: "end" | "both" | "none";
  label: string;
  color: ColorKey;
}

export interface DrawEl {
  id: string;
  kind: "draw";
  points: number[];
  color: ColorKey;
  width: number;
}

export interface TextEl {
  id: string;
  kind: "text";
  x: number;
  y: number;
  text: string;
  color: ColorKey;
  size: number;
}

export type BoardEl = NodeEl | EdgeEl | DrawEl | TextEl;

export type BoardOp = { type: "upsert"; el: BoardEl } | { type: "delete"; id: string };

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export function nodeCenter(n: NodeEl) {
  return { x: n.x + n.w / 2, y: n.y + n.h / 2 };
}

/** Point where a line from `from` to `to` exits the `from` node's box. */
export function anchorPoint(n: NodeEl, tx: number, ty: number) {
  const c = nodeCenter(n);
  const dx = tx - c.x;
  const dy = ty - c.y;
  if (dx === 0 && dy === 0) return c;
  const hw = n.w / 2 + 4;
  const hh = n.h / 2 + 4;
  const scale = Math.min(hw / Math.abs(dx || 1e-6), hh / Math.abs(dy || 1e-6));
  return { x: c.x + dx * scale, y: c.y + dy * scale };
}

export const PARTICIPANT_COLORS = [
  "#5fd4e6",
  "#f2b24c",
  "#8fd48a",
  "#c79bf2",
  "#f28fa0",
  "#8fb2f2",
  "#f2d46b",
];

export function colorForName(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 9973;
  return PARTICIPANT_COLORS[h % PARTICIPANT_COLORS.length];
}
