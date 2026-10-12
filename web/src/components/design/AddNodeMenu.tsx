"use client";

import { useState } from "react";
import type { Point } from "@/core/geometry";
import { type Block, CATEGORIES, type DataType, type NodeDef } from "@/core/graph";
import styles from "./AddNodeMenu.module.css";
import { TYPE_COLOR } from "./layout";

export type MenuPick = { kind: "node"; type: string } | { kind: "block"; block: Block };

/** Floating list of nodes and saved blocks. After a wire drop, only those that accept its type. */
export function AddNodeMenu({
  at,
  accepts,
  defs,
  blocks,
  onPick,
  onClose,
}: {
  at: Point;
  accepts?: DataType;
  defs: NodeDef[];
  blocks: Block[];
  onPick: (pick: MenuPick) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const nodes = defs.filter((d) => !d.hidden && (!accepts || d.inputs.some((p) => p.type === accepts)) && (!q || d.label.toLowerCase().includes(q)));
  const usable = blocks.filter((b) => (!accepts || b.group.inputs.some((p) => p.type === accepts)) && (!q || b.name.toLowerCase().includes(q)));
  const first: MenuPick | undefined = nodes[0] ? { kind: "node", type: nodes[0].type } : usable[0] && { kind: "block", block: usable[0] };

  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const height = Math.min(560, vh * 0.7);
  const left = Math.max(8, Math.min(at.x, vw - 290));
  const top = Math.max(8, Math.min(at.y, vh - height - 8));
  const sections = [...CATEGORIES, undefined].map((c) => ({ title: c ?? "Other", defs: nodes.filter((d) => d.category === c || (!c && !CATEGORIES.includes(d.category as never))) }));

  return (
    <div className={styles.backdrop} onPointerDown={onClose}>
      <div className={styles.menu} style={{ left, top, maxHeight: height }} onPointerDown={(e) => e.stopPropagation()} role="dialog" aria-label="Add a node">
        <input
          autoFocus
          type="text"
          placeholder={accepts ? `Nodes that take ${accepts}…` : "Search nodes…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && first) onPick(first);
          }}
        />
        <div className={styles.list}>
          {sections
            .filter((s) => s.defs.length > 0)
            .map((s) => (
              <div key={s.title} className={styles.group}>
                <div className={styles.section}>{s.title}</div>
                {s.defs.map((d) => (
                  <button key={d.type} type="button" onClick={() => onPick({ kind: "node", type: d.type })} title={d.description}>
                    <span className={styles.dot} style={{ background: d.outputs[0] ? TYPE_COLOR[d.outputs[0].type] : "var(--muted)" }} />
                    {d.label}
                    <small>
                      {d.inputs.map((p) => p.type).join(", ") || "source"} → {d.outputs.map((p) => p.type).join(", ")}
                    </small>
                  </button>
                ))}
              </div>
            ))}
          {usable.length > 0 && <div className={styles.section}>Blocks</div>}
          {usable.map((b) => (
            <button key={b.name} type="button" onClick={() => onPick({ kind: "block", block: b })}>
              <span className={styles.dot} style={{ background: b.group.outputs[0] ? TYPE_COLOR[b.group.outputs[0].type] : "var(--muted)" }} />
              {b.name}
              <small>
                {b.group.inputs.map((p) => p.type).join(", ") || "source"} → {b.group.outputs.map((p) => p.type).join(", ")}
              </small>
            </button>
          ))}
          {nodes.length + usable.length === 0 && <p className={styles.none}>Nothing matches</p>}
        </div>
      </div>
    </div>
  );
}
