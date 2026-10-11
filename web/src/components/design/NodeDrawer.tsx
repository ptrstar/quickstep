"use client";

import {
  type GraphDoc,
  type GraphNode,
  type GroupNode,
  type NodeStatus,
  type ParamSpec,
  type ParamValue,
  type Params,
  paramVisible,
  portsOf,
  type Registry,
  setParam,
  updateAt,
} from "@/core/graph";
import styles from "./NodeDrawer.module.css";
import { TYPE_COLOR } from "./layout";
import type { FontInfo } from "./useGraphEngine";

type Edit = (change: (g: GraphDoc) => GraphDoc, opts?: { coalesce?: string }) => void;

type Props = {
  registry: Registry;
  graph: GraphDoc;
  selection: GraphNode[];
  status: (id: string) => NodeStatus | undefined;
  /** Name of the image behind an asset key, if loaded in this session. */
  assetName: (key: string) => string | undefined;
  /** The group the editor is inside, if any: its pins can be toggled from inner nodes. */
  parent?: GroupNode;
  onEdit: Edit;
  onTogglePin: (node: string, param: string) => void;
  onLoadImage: (node: string, file: File) => void;
  fonts: FontInfo[];
  onLoadFont: (node: string, param: string, file: File) => void;
  onClose: () => void;
  onGroup: () => void;
  onUngroup: (id: string) => void;
  onEnter: (id: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSaveBlock: (group: GroupNode) => void;
};

function Control({
  spec,
  value,
  onChange,
  assetName,
  onLoadImage,
  fonts,
  onLoadFont,
  pin,
}: {
  spec: ParamSpec;
  value: ParamValue;
  onChange: (v: ParamValue) => void;
  assetName?: string;
  onLoadImage?: (file: File) => void;
  fonts?: FontInfo[];
  onLoadFont?: (file: File) => void;
  pin?: { pinned: boolean; toggle: () => void };
}) {
  const pinButton = pin && (
    <button type="button" className={`${styles.pin} ${pin.pinned ? styles.pinned : ""}`} onClick={pin.toggle} title={pin.pinned ? "Unpin from the group" : "Show on the group's drawer"} aria-pressed={pin.pinned}>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M6 2h4l-.5 4 2.5 2.5H4L6.5 6z M8 8.5V14" />
      </svg>
    </button>
  );
  switch (spec.kind) {
    case "number":
      return (
        <div className={styles.control}>
          <label className={styles.row}>
            <span>{spec.label}</span>
            <span className={styles.value}>
              <input
                type="number"
                min={spec.min}
                max={spec.max}
                step={spec.step}
                value={value as number}
                onChange={(e) => Number.isFinite(e.target.valueAsNumber) && onChange(e.target.valueAsNumber)}
                aria-label={`${spec.label} value`}
              />
              {spec.unit && <small>{spec.unit}</small>}
            </span>
            {pinButton}
          </label>
          <input type="range" min={spec.min} max={spec.max} step={spec.step} value={value as number} onChange={(e) => onChange(e.target.valueAsNumber)} aria-label={spec.label} />
        </div>
      );
    case "select":
      return (
        <label className={`${styles.control} ${styles.row}`}>
          <span>{spec.label}</span>
          <select value={value as string} onChange={(e) => onChange(e.target.value)}>
            {spec.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {pinButton}
        </label>
      );
    case "boolean":
      return (
        <label className={`${styles.control} ${styles.row}`}>
          <span>{spec.label}</span>
          <input type="checkbox" checked={value as boolean} onChange={(e) => onChange(e.target.checked)} />
          {pinButton}
        </label>
      );
    case "text":
      return (
        <label className={styles.control}>
          <span className={styles.row}>
            {spec.label}
            {pinButton}
          </span>
          {spec.multiline ? (
            <textarea rows={4} value={value as string} onChange={(e) => onChange(e.target.value)} />
          ) : (
            <input type="text" value={value as string} onChange={(e) => onChange(e.target.value)} />
          )}
        </label>
      );
    case "font": {
      const known = fonts?.some((f) => f.key === value);
      return (
        <div className={styles.control}>
          <label className={styles.row}>
            <span>{spec.label}</span>
            <select value={known ? (value as string) : ""} onChange={(e) => e.target.value && onChange(e.target.value)}>
              {!known && <option value="">font not loaded in this session</option>}
              <optgroup label="Single-line">
                {fonts?.filter((f) => f.kind === "single-line").map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Outline (drawn as outlines)">
                {fonts?.filter((f) => f.kind === "outline").map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.name}
                  </option>
                ))}
              </optgroup>
            </select>
            {pinButton}
          </label>
          <label className={styles.file}>
            Load a font file (SVG font, TTF, OTF, WOFF)
            <span className={styles.fileButton}>Load…</span>
            <input type="file" accept=".svg,.ttf,.otf,.woff,font/ttf,font/otf,font/woff,image/svg+xml" onChange={(e) => e.target.files?.[0] && onLoadFont?.(e.target.files[0])} />
          </label>
        </div>
      );
    }
    case "asset":
      return (
        <div className={styles.control}>
          <span>{spec.label}</span>
          <label className={styles.file}>
            {assetName ?? (value ? "image not loaded in this session" : "no image yet")}
            <span className={styles.fileButton}>Load…</span>
            <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && onLoadImage?.(e.target.files[0])} />
          </label>
        </div>
      );
  }
}

/** Controls of one plain node's params, hiding the ones whose condition does not hold. */
function ParamControls({
  registry,
  nodeType,
  params,
  onChange,
  only,
  pins,
  assetName,
  onLoadImage,
  fonts,
  onLoadFont,
}: {
  registry: Registry;
  nodeType: string;
  params: Params;
  onChange: (key: string, v: ParamValue) => void;
  only?: string[];
  pins?: { isPinned: (key: string) => boolean; toggle: (key: string) => void };
  assetName: (key: string) => string | undefined;
  onLoadImage?: (file: File) => void;
  fonts?: FontInfo[];
  onLoadFont?: (key: string, file: File) => void;
}) {
  const def = registry.get(nodeType);
  if (!def) return null;
  return (
    <>
      {Object.entries(def.params)
        .filter(([key, spec]) => (!only || only.includes(key)) && paramVisible(spec, params))
        .map(([key, spec]) => (
          <Control
            key={key}
            spec={spec}
            value={params[key]}
            onChange={(v) => onChange(key, v)}
            assetName={spec.kind === "asset" ? assetName(params[key] as string) : undefined}
            onLoadImage={onLoadImage}
            fonts={fonts}
            onLoadFont={(file) => onLoadFont?.(key, file)}
            pin={pins && { pinned: pins.isPinned(key), toggle: () => pins.toggle(key) }}
          />
        ))}
    </>
  );
}

export function NodeDrawer(p: Props) {
  const { registry, selection } = p;

  if (selection.length > 1) {
    return (
      <aside className={styles.drawer} aria-label="Selection">
        <div className={styles.head}>
          <strong>{selection.length} nodes selected</strong>
          <CloseButton onClose={p.onClose} />
        </div>
        <p className={styles.muted}>Group them into one block: wires leaving the selection become its ports.</p>
        <div className={styles.actions}>
          <button type="button" className="primary" onClick={p.onGroup}>
            Group <kbd>G</kbd>
          </button>
          <button type="button" onClick={p.onDuplicate}>
            Duplicate
          </button>
          <button type="button" className="danger" onClick={p.onDelete}>
            Delete
          </button>
        </div>
      </aside>
    );
  }

  const node = selection[0];
  if (!node) return null;
  const status = p.status(node.id);
  const out = portsOf(registry, node).outputs[0]?.type;

  const footer = (
    <>
      <div className={styles.spacer} />
      {status && (
        <div className={`${styles.status} ${status.state === "error" ? styles.statusError : ""}`}>
          {status.state === "ok" || status.state === "bypassed" ? status.summary ?? status.state : status.error}
          {status.ms > 0 && ` · ${Math.round(status.ms)} ms`}
        </div>
      )}
    </>
  );

  if (node.kind === "group") {
    const group = node;
    return (
      <aside className={styles.drawer} aria-label={`${group.name} block`}>
        <div className={styles.head}>
          <span className={styles.dot} style={{ background: out ? TYPE_COLOR[out] : "var(--muted)" }} />
          <input
            className={styles.name}
            value={group.name}
            aria-label="Block name"
            onChange={(e) => p.onEdit((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === group.id ? { ...group, name: e.target.value } : n)) }), { coalesce: `name:${group.id}` })}
          />
          <CloseButton onClose={p.onClose} />
        </div>
        <p className={styles.muted}>
          {group.graph.nodes.map((n) => (n.kind === "group" ? n.name : (registry.get(n.type)?.label ?? n.type))).join(" · ")}
        </p>
        {group.pinned.length === 0 ? (
          <p className={styles.muted}>Open the block and pin controls to show them here.</p>
        ) : (
          group.pinned.map(({ node: inner, param }) => {
            const n = group.graph.nodes.find((m) => m.id === inner);
            if (!n || n.kind !== "node") return null;
            return (
              <ParamControls
                key={`${inner}.${param}`}
                registry={registry}
                nodeType={n.type}
                params={n.params}
                only={[param]}
                assetName={p.assetName}
                fonts={p.fonts}
                onChange={(key, v) => p.onEdit((g) => updateAt(g, [group.id], (ig) => setParam(registry, ig, inner, key, v)), { coalesce: `${group.id}/${inner}:${key}` })}
              />
            );
          })
        )}
        {footer}
        <div className={styles.actions}>
          <button type="button" className="primary" onClick={() => p.onEnter(group.id)}>
            Open
          </button>
          <button type="button" onClick={() => p.onSaveBlock(group)}>
            Save as block
          </button>
          <button type="button" onClick={() => p.onUngroup(group.id)}>
            Ungroup
          </button>
          <button type="button" className="danger" onClick={p.onDelete}>
            Delete
          </button>
        </div>
      </aside>
    );
  }

  const def = registry.get(node.type);
  return (
    <aside className={styles.drawer} aria-label={`${def?.label ?? node.type} controls`}>
      <div className={styles.head}>
        <span className={styles.dot} style={{ background: out ? TYPE_COLOR[out] : "var(--muted)" }} />
        <strong>{def?.label ?? node.type}</strong>
        <CloseButton onClose={p.onClose} />
      </div>
      {def && <p className={styles.muted}>{def.description}</p>}
      <ParamControls
        registry={registry}
        nodeType={node.type}
        params={node.params}
        assetName={p.assetName}
        onLoadImage={(file) => p.onLoadImage(node.id, file)}
        fonts={p.fonts}
        onLoadFont={(key, file) => p.onLoadFont(node.id, key, file)}
        onChange={(key, v) => p.onEdit((g) => setParam(registry, g, node.id, key, v), { coalesce: `${node.id}:${key}` })}
        pins={
          p.parent && {
            isPinned: (key) => p.parent!.pinned.some((x) => x.node === node.id && x.param === key),
            toggle: (key) => p.onTogglePin(node.id, key),
          }
        }
      />
      {footer}
      <div className={styles.actions}>
        <button
          type="button"
          aria-pressed={!!node.bypass}
          onClick={() => p.onEdit((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === node.id && n.kind === "node" ? { ...n, bypass: !n.bypass } : n)) }))}
        >
          {node.bypass ? "Enable" : "Bypass"}
        </button>
        <button type="button" onClick={p.onDuplicate}>
          Duplicate
        </button>
        <button type="button" className="danger" onClick={p.onDelete}>
          Delete
        </button>
      </div>
    </aside>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
      <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M2 2l10 10M12 2L2 12" />
      </svg>
    </button>
  );
}
