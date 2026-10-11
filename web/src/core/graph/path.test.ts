import { describe, expect, it } from "vitest";
import { defaultPipeline } from "./defaults";
import { removeNodes } from "./doc";
import { groupNodes } from "./group";
import { registry } from "./nodes";
import { duplicate, graphAt, updateAt, validPath } from "./path";

const setup = () => {
  const doc = defaultPipeline(registry);
  const [image, gray, contrast, blur] = doc.nodes.map((n) => n.id);
  const g = groupNodes(registry, doc, [gray, contrast, blur], "Tone");
  return { doc: g.doc, group: g.id, image, gray, contrast, blur };
};

describe("graph paths", () => {
  it("reads and edits the graph inside a group", () => {
    const { doc, group, contrast } = setup();
    expect(graphAt(doc, [group]).nodes).toHaveLength(3);
    const moved = updateAt(doc, [group], (g) => ({
      ...g,
      nodes: g.nodes.map((n) => (n.id === contrast ? { ...n, position: { x: 999, y: 0 } } : n)),
    }));
    expect(graphAt(moved, [group]).nodes.find((n) => n.id === contrast)!.position.x).toBe(999);
    expect(moved.edges).toEqual(doc.edges);
  });

  it("removing the inner node behind a port removes the port and its outside wires", () => {
    const { doc, group, gray } = setup();
    const after = updateAt(doc, [group], (g) => removeNodes(g, [gray]));
    const g = after.nodes.find((n) => n.id === group)!;
    expect(g.kind === "group" && g.inputs).toEqual([]);
    expect(after.edges.some((e) => e.to.node === group)).toBe(false);
    expect(after.edges.some((e) => e.from.node === group)).toBe(true);
  });

  it("keeps only the part of a path that still exists", () => {
    const { doc, group } = setup();
    expect(validPath(doc, [group, "gone"])).toEqual([group]);
    expect(validPath(removeNodes(doc, [group]), [group])).toEqual([]);
  });

  it("duplicates nodes with the wires between them", () => {
    const doc = defaultPipeline(registry);
    const ids = doc.nodes.slice(1, 3).map((n) => n.id);
    const d = duplicate(doc, ids);
    expect(d.doc.nodes).toHaveLength(9);
    expect(d.doc.edges).toHaveLength(7);
    expect(d.ids.every((id) => !ids.includes(id))).toBe(true);
  });
});
