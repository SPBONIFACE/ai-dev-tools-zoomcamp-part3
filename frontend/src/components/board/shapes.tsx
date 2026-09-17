import { SHAPE_MAP, type NodeEl } from "@/lib/board-types";

/** Pure SVG rendering of a node's body (no labels). */
export function NodeBody({ el }: { el: NodeEl }) {
  const spec = SHAPE_MAP[el.shape] ?? SHAPE_MAP["service"];
  const stroke = `var(--${el.color})`;
  const fill = `color-mix(in oklab, var(--${el.color}) 16%, var(--surface))`;
  const common = { style: { fill, stroke, strokeWidth: 1.75 } as const };
  const { w, h } = el;

  switch (spec.form) {
    case "cylinder": {
      const ry = Math.min(16, h * 0.18);
      return (
        <g>
          <path
            d={`M0 ${ry} a ${w / 2} ${ry} 0 0 1 ${w} 0 v ${h - ry * 2} a ${w / 2} ${ry} 0 0 1 ${-w} 0 z`}
            {...common}
          />
          <path
            d={`M0 ${ry} a ${w / 2} ${ry} 0 0 0 ${w} 0`}
            style={{ fill: "none", stroke, strokeWidth: 1.75, opacity: 0.7 }}
          />
        </g>
      );
    }
    case "pipe": {
      const rx = Math.min(14, h * 0.3);
      return (
        <g>
          <rect x={0} y={0} width={w} height={h} rx={rx} {...common} />
          {[0.33, 0.66].map((t) => (
            <line
              key={t}
              x1={w * t}
              y1={6}
              x2={w * t}
              y2={h - 6}
              style={{ stroke, strokeWidth: 1, opacity: 0.45 }}
            />
          ))}
        </g>
      );
    }
    case "hex": {
      const c = Math.min(18, w * 0.12);
      return (
        <path
          d={`M${c} 0 H${w - c} L${w} ${h / 2} L${w - c} ${h} H${c} L0 ${h / 2} Z`}
          {...common}
        />
      );
    }
    case "cloud": {
      return (
        <path
          d={`M${w * 0.22} ${h} a ${h * 0.28} ${h * 0.28} 0 0 1 0 ${-h * 0.5}
              a ${h * 0.3} ${h * 0.3} 0 0 1 ${w * 0.28} ${-h * 0.3}
              a ${h * 0.3} ${h * 0.3} 0 0 1 ${w * 0.4} ${h * 0.16}
              a ${h * 0.26} ${h * 0.26} 0 0 1 ${w * 0.1} ${h * 0.64} Z`}
          {...common}
        />
      );
    }
    case "group": {
      return (
        <rect
          x={0}
          y={0}
          width={w}
          height={h}
          rx={10}
          style={{
            fill: `color-mix(in oklab, var(--${el.color}) 6%, transparent)`,
            stroke,
            strokeWidth: 1.5,
            strokeDasharray: "8 6",
          }}
        />
      );
    }
    case "note": {
      const fold = 18;
      return (
        <g>
          <path
            d={`M0 0 H${w - fold} L${w} ${fold} V${h} H0 Z`}
            style={{
              fill: `color-mix(in oklab, var(--${el.color}) 22%, var(--surface))`,
              stroke,
              strokeWidth: 1.5,
            }}
          />
          <path
            d={`M${w - fold} 0 L${w - fold} ${fold} L${w} ${fold}`}
            style={{ fill: "none", stroke, strokeWidth: 1.5 }}
          />
        </g>
      );
    }
    default:
      return <rect x={0} y={0} width={w} height={h} rx={8} {...common} />;
  }
}

/** Small glyph used in the palette buttons. */
export function ShapeGlyph({ shape, color }: { shape: NodeEl["shape"]; color: string }) {
  const el: NodeEl = {
    id: "g",
    kind: "node",
    shape,
    x: 0,
    y: 0,
    w: 34,
    h: 22,
    label: "",
    sub: "",
    color: color as NodeEl["color"],
  };
  return (
    <svg width={38} height={26} viewBox="-2 -2 38 26" aria-hidden="true">
      <NodeBody el={el} />
    </svg>
  );
}
