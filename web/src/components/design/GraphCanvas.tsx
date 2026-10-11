"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Point } from "@/core/geometry";
import {
  addNode,
  connect,
  createNode,
  type DataType,
  disconnect,
  type GraphDoc,
  isOutput,
  type GraphPath,
  type NodeId,
  type NodeStatus,
  type PortRef,
  portsOf,
  type Registry,
  resolveOutput,
  type Thumb,
} from "@/core/graph";
import styles from "./GraphCanvas.module.css";
import { bounds, CARD, CARD_HEIGHT, portPosition, TYPE_COLOR, wirePath } from "./layout";
import { NodeCard } from "./NodeCard";

type View = { x: number; y: number; k: number };

type Drag =
  | { kind: "pan"; client: Point; view: View }
  | { kind: "marquee"; from: Point; to: Point; additive: boolean }
  | { kind: "move"; ids: NodeId[]; from: Point; delta: Point; clickId: NodeId; toggled: boolean }
  | { kind: "wire"; from: PortRef; type: DataType; at: Point };

export type WireSource = { ref: PortRef; type: DataType };

type Props = {
  registry: Registry;
  graph: GraphDoc;
  path: GraphPath;
  status: Map<string, NodeStatus>;
  thumbs: Map<string, Thumb>;
  selection: NodeId[];
  onEdit: (change: (g: GraphDoc) => GraphDoc, opts?: { select?: NodeId[] }) => void;
  onSelect: (ids: NodeId[], drawer?: boolean) => void;
  onEnter: (id: NodeId) => void;
  /** Open the add-node menu at a graph position, optionally to continue a dragged wire. */
  onAddAt: (at: Point, screen: Point, from?: WireSource) => void;
  onMessage: (text: string) => void;
};

const CLICK_SLOP = 4; // px

export function GraphCanvas({ registry, graph, path, status, thumbs, selection, onEdit, onSelect, onEnter, onAddAt, onMessage }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 40, y: 40, k: 1 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const prefix = path.length ? path.join("/") + "/" : "";

  // The output knob is docked at the right edge of the top-level canvas, outside the pannable world.
  const output = path.length === 0 ? graph.nodes.find(isOutput) : undefined;
  const nodes = graph.nodes.filter((n) => n !== output);
  const knobScreen = { x: size.width - 26, y: size.height / 2 };
  const knobWorld = { x: (knobScreen.x - view.x) / view.k, y: (knobScreen.y - view.y) / view.k };
  const outputWired = !!output && graph.edges.some((e) => e.to.node === output.id);

  useEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toWorld = useCallback(
    (cx: number, cy: number): Point => {
      const r = box.current!.getBoundingClientRect();
      return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k };
    },
    [view],
  );

  const fit = useCallback(() => {
    const b = bounds({ ...graph, nodes: graph.nodes.filter((n) => !isOutput(n)) });
    const el = box.current;
    if (!b || !el) return;
    const { width, height } = el.getBoundingClientRect();
    const k = Math.min(1.1, (width - 80) / b.w, (height - 80) / b.h);
    setView({ k, x: (width - b.w * k) / 2 - b.x * k, y: (height - b.h * k) / 2 - b.y * k });
  }, [graph]);

  // Fit when entering a group or loading another graph.
  const fitted = useRef<string>("");
  useLayoutEffect(() => {
    const key = `${path.join("/")}|${graph.nodes.length > 0}`;
    if (fitted.current !== key && graph.nodes.length > 0) {
      fitted.current = key;
      fit();
    }
  }, [path, graph, fit]);

  // Wheel: pan, or zoom around the pointer with ctrl / pinch. Needs a non-passive listener.
  useEffect(() => {
    const el = box.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setView((v) => {
        if (e.ctrlKey || e.metaKey) {
          const k = Math.min(2.5, Math.max(0.2, v.k * Math.exp(-e.deltaY * 0.01)));
          const px = e.clientX - r.left;
          const py = e.clientY - r.top;
          return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
        }
        return { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const position = (id: NodeId, p: Point): Point =>
    drag?.kind === "move" && drag.ids.includes(id) ? { x: p.x + drag.delta.x, y: p.y + drag.delta.y } : p;

  const capture = (e: React.PointerEvent) => box.current!.setPointerCapture(e.pointerId);

  const onBackgroundDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget && !(e.target as Element).closest("[data-background]")) return;
    capture(e);
    if (e.button === 1 || e.altKey) {
      setDrag({ kind: "pan", client: { x: e.clientX, y: e.clientY }, view });
    } else {
      const at = toWorld(e.clientX, e.clientY);
      setDrag({ kind: "marquee", from: at, to: at, additive: e.shiftKey });
    }
  };

  const onCardDown = (id: NodeId) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    capture(e);
    let ids = selection.includes(id) ? selection : [id];
    let toggled = false;
    if (e.shiftKey) {
      ids = selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id];
      toggled = true;
      onSelect(ids, false);
    } else if (!selection.includes(id)) {
      onSelect([id], false);
    }
    setDrag({ kind: "move", ids, from: toWorld(e.clientX, e.clientY), delta: { x: 0, y: 0 }, clickId: id, toggled });
  };

  const onPortDown = (id: NodeId) => (e: React.PointerEvent, side: "inputs" | "outputs", port: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const node = graph.nodes.find((n) => n.id === id)!;
    const at = toWorld(e.clientX, e.clientY);
    if (side === "outputs") {
      const type = portsOf(registry, node).outputs.find((p) => p.name === port)!.type;
      capture(e);
      setDrag({ kind: "wire", from: { node: id, port }, type, at });
      return;
    }
    // pulling a wire off an input picks it up from its source
    const edge = graph.edges.find((x) => x.to.node === id && x.to.port === port);
    if (!edge) return;
    const src = graph.nodes.find((n) => n.id === edge.from.node)!;
    const type = portsOf(registry, src).outputs.find((p) => p.name === edge.from.port)!.type;
    onEdit((g) => disconnect(g, { node: id, port }));
    capture(e);
    setDrag({ kind: "wire", from: edge.from, type, at });
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    if (drag.kind === "pan") {
      setDrag(drag);
      setView({ ...drag.view, x: drag.view.x + e.clientX - drag.client.x, y: drag.view.y + e.clientY - drag.client.y });
      return;
    }
    const at = toWorld(e.clientX, e.clientY);
    if (drag.kind === "marquee") setDrag({ ...drag, to: at });
    else if (drag.kind === "move") setDrag({ ...drag, delta: { x: at.x - drag.from.x, y: at.y - drag.from.y } });
    else setDrag({ ...drag, at });
  };

  const connectTo = (from: PortRef, type: DataType, to: PortRef, toType: DataType) => {
    const r = connect(registry, graph, from, to);
    if (r.ok) {
      onEdit((g) => {
        const c = connect(registry, g, from, to);
        return c.ok ? c.doc : g;
      });
    } else if (type === "image" && toType === "gray") {
      // the one conversion there is: put a Grayscale in between
      const a = portPosition(registry, graph.nodes.find((n) => n.id === from.node)!, "outputs", from.port);
      const gray = createNode(registry, "grayscale", { x: a.x + 30, y: a.y - CARD.portTop + 40 });
      onEdit((g) => {
        let d = addNode(g, gray);
        const c1 = connect(registry, d, from, { node: gray.id, port: "image" });
        if (c1.ok) d = c1.doc;
        const c2 = connect(registry, d, { node: gray.id, port: "gray" }, to);
        return c2.ok ? c2.doc : d;
      });
      onMessage("Inserted Grayscale between Image and Gray");
    } else {
      onMessage(`Cannot connect: ${r.reason}`);
    }
  };

  const onUp = (e: React.PointerEvent) => {
    if (!drag) return;
    setDrag(null);
    if (drag.kind === "marquee") {
      const x0 = Math.min(drag.from.x, drag.to.x);
      const x1 = Math.max(drag.from.x, drag.to.x);
      const y0 = Math.min(drag.from.y, drag.to.y);
      const y1 = Math.max(drag.from.y, drag.to.y);
      if (x1 - x0 < CLICK_SLOP / view.k && y1 - y0 < CLICK_SLOP / view.k) {
        if (!drag.additive) onSelect([], false);
        return;
      }
      const hit = nodes
        .filter((n) => n.position.x < x1 && n.position.x + CARD.width > x0 && n.position.y < y1 && n.position.y + CARD_HEIGHT > y0)
        .map((n) => n.id);
      onSelect(drag.additive ? [...new Set([...selection, ...hit])] : hit, false);
    } else if (drag.kind === "move") {
      const moved = Math.hypot(drag.delta.x, drag.delta.y) * view.k > CLICK_SLOP;
      if (moved) {
        const { ids, delta } = drag;
        onEdit((g) => ({
          ...g,
          nodes: g.nodes.map((n) => (ids.includes(n.id) ? { ...n, position: { x: Math.round(n.position.x + delta.x), y: Math.round(n.position.y + delta.y) } } : n)),
        }));
      } else if (!drag.toggled) {
        onSelect([drag.clickId], true); // a click opens the drawer
      }
    } else if (drag.kind === "wire") {
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-port][data-side='inputs']");
      if (target) {
        connectTo(drag.from, drag.type, { node: target.dataset.node!, port: target.dataset.port! }, target.dataset.type as DataType);
      } else if (!document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-node]")) {
        onAddAt(drag.at, { x: e.clientX, y: e.clientY }, { ref: drag.from, type: drag.type });
      }
    }
  };

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const thumbOf = (id: NodeId): Thumb | undefined => {
    const node = nodeById.get(id)!;
    if (node.kind === "node") return thumbs.get(prefix + id);
    const out = node.outputs[0];
    const flat = out && resolveOutput(graph, { node: id, port: out.name }, path);
    return flat && thumbs.get(flat.node);
  };

  const marquee = drag?.kind === "marquee" ? drag : undefined;

  return (
    <div
      ref={box}
      className={styles.canvas}
      style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${20 * view.k}px ${20 * view.k}px` }}
      onPointerDown={onBackgroundDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget) onAddAt(toWorld(e.clientX, e.clientY), { x: e.clientX, y: e.clientY });
      }}
    >
      <div className={styles.world} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }} data-background>
        <svg className={styles.wires} aria-hidden="true">
          {graph.edges.map((e) => {
            const a = nodeById.get(e.from.node);
            const b = nodeById.get(e.to.node);
            if (!a || !b) return null;
            const type = portsOf(registry, a).outputs.find((p) => p.name === e.from.port)?.type ?? "gray";
            const p = portPosition(registry, a, "outputs", e.from.port, position(a.id, a.position));
            const q = b === output ? knobWorld : portPosition(registry, b, "inputs", e.to.port, position(b.id, b.position));
            return <path key={`${e.to.node}.${e.to.port}`} d={wirePath(p, q)} stroke={TYPE_COLOR[type]} />;
          })}
          {drag?.kind === "wire" &&
            (() => {
              const a = nodeById.get(drag.from.node);
              if (!a) return null;
              return <path d={wirePath(portPosition(registry, a, "outputs", drag.from.port), drag.at)} stroke={TYPE_COLOR[drag.type]} strokeDasharray="6 5" />;
            })()}
        </svg>
        {nodes.map((n) => (
          <NodeCard
            key={n.id}
            registry={registry}
            node={n}
            position={position(n.id, n.position)}
            status={status.get(prefix + n.id)}
            thumb={thumbOf(n.id)}
            selected={selection.includes(n.id)}
            onCardDown={onCardDown(n.id)}
            onPortDown={onPortDown(n.id)}
            onDoubleClick={() => (n.kind === "group" ? onEnter(n.id) : onSelect([n.id], true))}
          />
        ))}
        {marquee && (
          <div
            className={styles.marquee}
            style={{
              left: Math.min(marquee.from.x, marquee.to.x),
              top: Math.min(marquee.from.y, marquee.to.y),
              width: Math.abs(marquee.to.x - marquee.from.x),
              height: Math.abs(marquee.to.y - marquee.from.y),
            }}
          />
        )}
      </div>
      {nodes.length === 0 && <p className={styles.empty}>Double-click to add a node</p>}
      {output && (
        <div className={`${styles.knob} ${outputWired ? "" : styles.knobOpen}`} style={{ top: knobScreen.y }} title="Whatever drawing is wired here gets plotted">
          <span
            className={styles.knobPort}
            data-port="drawing"
            data-side="inputs"
            data-node={output.id}
            data-type="drawing"
            onPointerDown={(e) => onPortDown(output.id)(e, "inputs", "drawing")}
          />
          <span className={styles.knobLabel}>{outputWired ? "Output" : "Output · wire a drawing here"}</span>
        </div>
      )}
      <div className={styles.zoom}>
        <span>{Math.round(view.k * 100)}%</span>
        <button type="button" onClick={fit}>
          Fit
        </button>
      </div>
    </div>
  );
}
