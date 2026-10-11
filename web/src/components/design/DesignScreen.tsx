"use client";

import { useEffect, useState } from "react";
import type { Point } from "@/core/geometry";
import {
  addNode,
  connect,
  createNode,
  type GraphDoc,
  graphAt,
  type GroupNode,
  groupNodes,
  newId,
  NODE_DEFS,
  type PortRef,
  registry,
  removeNodes,
  resolveOutput,
  setParam,
  toBlock,
  ungroup,
  duplicate,
} from "@/core/graph";
import { AddNodeMenu, type MenuPick } from "./AddNodeMenu";
import styles from "./DesignScreen.module.css";
import { GraphCanvas, type WireSource } from "./GraphCanvas";
import { CARD } from "./layout";
import type { Library } from "./library";
import { NodeDrawer } from "./NodeDrawer";
import { PaperView } from "./PaperView";
import type { Project } from "./useProject";
import { decodeImage, type useGraphEngine } from "./useGraphEngine";

type Engine = ReturnType<typeof useGraphEngine>;

/** ① Design: the node graph, the drawer for the selected node, and the paper. */
export function DesignScreen({
  project,
  engine,
  library,
  assetNames,
  onAssetLoaded,
  onMessage,
}: {
  project: Project;
  engine: Engine;
  library: Library;
  assetNames: Map<string, string>;
  onAssetLoaded: (key: string, name: string) => void;
  onMessage: (text: string) => void;
}) {
  const { path } = project;
  const graph = graphAt(project.doc, path);
  const parentGraph = graphAt(project.doc, path.slice(0, -1));
  const parent = path.length ? (parentGraph.nodes.find((n) => n.id === path.at(-1)) as GroupNode | undefined) : undefined;
  const selected = graph.nodes.filter((n) => project.selection.includes(n.id));
  const prefix = path.length ? path.join("/") + "/" : "";
  const [menu, setMenu] = useState<{ world: Point; screen: Point; from?: WireSource }>();

  const group = () => {
    if (project.selection.length === 0) return;
    const g = groupNodes(registry, graph, project.selection, "Block");
    project.edit(() => g.doc, { select: [g.id] });
  };
  const ungroupSelected = (id = project.selection[0]) => {
    const node = graph.nodes.find((n) => n.id === id);
    if (node?.kind !== "group") return;
    project.edit((g) => ungroup(g, id), { select: node.graph.nodes.map((n) => n.id) });
  };
  const remove = () => project.edit((g) => removeNodes(g, project.selection), { select: [] });
  const dup = () => {
    const d = duplicate(graph, project.selection);
    project.edit(() => d.doc, { select: d.ids });
  };

  // keyboard shortcuts, except while typing in a field
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) project.redo();
        else project.undo();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        dup();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (project.selection.length) remove();
      } else if (e.key.toLowerCase() === "g" && !mod) {
        if (e.shiftKey) ungroupSelected();
        else group();
      } else if (e.key === "Escape") {
        if (project.drawer || project.selection.length) project.select([], false);
        else if (path.length) project.exit(path.length - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const loadImage = async (nodeId: string, file: File) => {
    try {
      const image = await decodeImage(file);
      const key = `${file.name}#${newId("a")}`;
      engine.addAsset(key, image);
      onAssetLoaded(key, file.name);
      project.edit((g) => setParam(registry, g, nodeId, "asset", key));
    } catch (e) {
      onMessage(`Could not read ${file.name}: ${e}`);
    }
  };

  const pick = (p: MenuPick) => {
    if (!menu) return;
    const at = { x: Math.round(menu.world.x), y: Math.round(menu.world.y - CARD.portTop) };
    const node =
      p.kind === "node"
        ? createNode(registry, p.type, at)
        : { ...structuredClone(p.block.group), id: newId("g"), position: at };
    const from: PortRef | undefined = menu.from?.ref;
    const type = menu.from?.type;
    project.edit(
      (g: GraphDoc) => {
        let d = addNode(g, node);
        if (from && type) {
          const inputs = node.kind === "group" ? node.inputs : registry.get(node.type)!.inputs;
          const port = inputs.find((i) => i.type === type);
          if (port) {
            const r = connect(registry, d, from, { node: node.id, port: port.name });
            if (r.ok) d = r.doc;
          }
        }
        return d;
      },
      { select: [node.id] },
    );
    setMenu(undefined);
  };

  // what "Selected node" shows on the paper
  const one = selected.length === 1 ? selected[0] : undefined;
  const selectedFlat =
    one &&
    (one.kind === "node"
      ? prefix + one.id
      : one.outputs[0] && resolveOutput(graph, { node: one.id, port: one.outputs[0].name }, path)?.node);
  const selectedLabel = one && (one.kind === "group" ? one.name : registry.get(one.type)?.label);

  const crumbs = path.map((id, i) => {
    const g = graphAt(project.doc, path.slice(0, i)).nodes.find((n) => n.id === id);
    return { depth: i + 1, name: g?.kind === "group" ? g.name : "?" };
  });

  return (
    <div className={styles.screen}>
      <section className={styles.graphPanel}>
        <div className={styles.bar}>
          <nav aria-label="Location in the graph" className={styles.crumbs}>
            <button type="button" onClick={() => project.exit(0)} aria-current={path.length === 0 ? "page" : undefined}>
              Pipeline
            </button>
            {crumbs.map((c) => (
              <span key={c.depth}>
                <span aria-hidden="true"> › </span>
                <button type="button" onClick={() => project.exit(c.depth)} aria-current={c.depth === path.length ? "page" : undefined}>
                  {c.name}
                </button>
              </span>
            ))}
          </nav>
          <span className={styles.hint}>Click a node to edit · drag to select · G groups · double-click a block to open it</span>
          <div className={styles.grow} />
          {engine.busy && <span className={styles.hint}>computing…</span>}
          <button type="button" onClick={(e) => setMenu({ world: { x: 40, y: 40 }, screen: { x: e.clientX, y: e.clientY + 16 } })}>
            + Node
          </button>
          <button type="button" onClick={project.undo} disabled={project.past.length === 0} title="Undo (⌘Z)">
            Undo
          </button>
        </div>
        <div className={styles.canvasArea}>
          <GraphCanvas
            registry={registry}
            graph={graph}
            path={path}
            status={engine.status}
            thumbs={engine.thumbs}
            selection={project.selection}
            onEdit={(change, opts) => project.edit(change, opts)}
            onSelect={project.select}
            onEnter={project.enter}
            onAddAt={(world, screen, from) => setMenu({ world, screen, from })}
            onMessage={onMessage}
          />
          {project.drawer && selected.length > 0 && (
            <NodeDrawer
              registry={registry}
              graph={graph}
              selection={selected}
              status={(id) => engine.status.get(prefix + id)}
              assetName={(key) => assetNames.get(key)}
              parent={parent}
              onEdit={(change, opts) => project.edit(change, opts)}
              onTogglePin={(node, param) =>
                parent &&
                project.edit(
                  (g) => ({
                    ...g,
                    nodes: g.nodes.map((n) => {
                      if (n.id !== parent.id || n.kind !== "group") return n;
                      const has = n.pinned.some((x) => x.node === node && x.param === param);
                      return { ...n, pinned: has ? n.pinned.filter((x) => !(x.node === node && x.param === param)) : [...n.pinned, { node, param }] };
                    }),
                  }),
                  { at: path.slice(0, -1) },
                )
              }
              onLoadImage={loadImage}
              onClose={() => project.setDrawer(false)}
              onGroup={group}
              onUngroup={ungroupSelected}
              onEnter={project.enter}
              onDuplicate={dup}
              onDelete={remove}
              onSaveBlock={(g) => {
                library.saveBlock(toBlock(registry, g));
                onMessage(`Saved "${g.name}" to your blocks`);
              }}
            />
          )}
        </div>
      </section>
      <PaperView drawing={engine.drawing} selected={selectedFlat ? engine.thumbs.get(selectedFlat) : undefined} selectedLabel={selectedLabel} />
      {menu && (
        <AddNodeMenu at={menu.screen} accepts={menu.from?.type} defs={NODE_DEFS} blocks={library.blocks} onPick={pick} onClose={() => setMenu(undefined)} />
      )}
    </div>
  );
}
