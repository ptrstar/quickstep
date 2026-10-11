import type { Point } from "@/core/geometry";
import type { DataType, GraphDoc, GraphNode, Registry } from "@/core/graph";
import { portsOf } from "@/core/graph";

/** Card geometry in graph units. Fixed, so wires can be drawn without measuring the DOM. */
export const CARD = { width: 200, header: 32, thumb: 112, footer: 26, portTop: 46, portStep: 24 };
export const CARD_HEIGHT = CARD.header + CARD.thumb + CARD.footer;

export const TYPE_COLOR: Record<DataType, string> = {
  image: "var(--t-image)",
  gray: "var(--t-gray)",
  lines: "var(--t-lines)",
  drawing: "var(--t-drawing)",
};

export function portPosition(registry: Registry, node: GraphNode, side: "inputs" | "outputs", port: string, at: Point = node.position): Point {
  const ports = portsOf(registry, node)[side];
  const i = Math.max(0, ports.findIndex((p) => p.name === port));
  return { x: at.x + (side === "outputs" ? CARD.width : 0), y: at.y + CARD.portTop + i * CARD.portStep };
}

/** Bezier from an output to an input, curving out horizontally. */
export function wirePath(a: Point, b: Point): string {
  const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
  return `M${a.x} ${a.y} C${a.x + dx} ${a.y} ${b.x - dx} ${b.y} ${b.x} ${b.y}`;
}

export function bounds(graph: GraphDoc): { x: number; y: number; w: number; h: number } | undefined {
  if (graph.nodes.length === 0) return undefined;
  const xs = graph.nodes.map((n) => n.position.x);
  const ys = graph.nodes.map((n) => n.position.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) + CARD.width - x, h: Math.max(...ys) + CARD_HEIGHT - y };
}
