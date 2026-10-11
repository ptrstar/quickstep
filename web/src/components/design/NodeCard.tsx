"use client";

import { memo, useEffect, useRef } from "react";
import type { Point } from "@/core/geometry";
import { type GraphNode, type NodeStatus, portsOf, type Registry, type Thumb } from "@/core/graph";
import { CARD, TYPE_COLOR } from "./layout";
import styles from "./GraphCanvas.module.css";
import { drawThumb } from "./thumbCanvas";

export type PortDown = (e: React.PointerEvent, side: "inputs" | "outputs", port: string) => void;

type Props = {
  registry: Registry;
  node: GraphNode;
  position: Point;
  status?: NodeStatus;
  thumb?: Thumb;
  selected: boolean;
  onCardDown: (e: React.PointerEvent) => void;
  onPortDown: PortDown;
  onDoubleClick: () => void;
};

function label(registry: Registry, node: GraphNode) {
  return node.kind === "group" ? node.name : (registry.get(node.type)?.label ?? node.type);
}

export const NodeCard = memo(function NodeCard({ registry, node, position, status, thumb, selected, onCardDown, onPortDown, onDoubleClick }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const ports = portsOf(registry, node);
  const outType = ports.outputs[0]?.type;

  useEffect(() => {
    if (canvas.current) drawThumb(canvas.current, thumb, CARD.width - 2, CARD.thumb);
  }, [thumb]);

  const state = status?.state;
  const footer =
    state === "error" || state === "waiting" ? status?.error : state === "bypassed" ? "bypassed" : (status?.summary ?? (node.kind === "group" ? `block of ${node.graph.nodes.length}` : ""));

  const className = [
    styles.card,
    node.kind === "group" ? styles.group : "",
    selected ? styles.selected : "",
    state === "error" ? styles.error : "",
    state === "bypassed" ? styles.bypassed : "",
  ].join(" ");

  return (
    <div
      className={className}
      style={{ left: position.x, top: position.y, width: CARD.width }}
      onPointerDown={onCardDown}
      onDoubleClick={onDoubleClick}
      data-node={node.id}
    >
      <div className={styles.header}>
        <span className={styles.dot} style={{ background: outType ? TYPE_COLOR[outType] : "var(--muted)" }} />
        <span className={styles.title}>{label(registry, node)}</span>
        {status && status.ms > 0 && <span className={styles.ms}>{status.ms < 1 ? "<1" : Math.round(status.ms)} ms</span>}
      </div>
      <canvas ref={canvas} className={styles.thumb} style={{ height: CARD.thumb }} />
      <div className={`${styles.footer} ${state === "error" ? styles.footerError : ""}`} title={footer}>
        {footer}
      </div>
      {(["inputs", "outputs"] as const).map((side) =>
        ports[side].map((p, i) => (
          <span
            key={`${side}-${p.name}`}
            className={`${styles.port} ${side === "inputs" ? styles.portIn : styles.portOut}`}
            style={{ top: CARD.portTop + i * CARD.portStep - 7, background: TYPE_COLOR[p.type] }}
            title={`${p.name} (${p.type})`}
            data-port={p.name}
            data-side={side}
            data-node={node.id}
            data-type={p.type}
            onPointerDown={(e) => onPortDown(e, side, p.name)}
          />
        )),
      )}
    </div>
  );
});

