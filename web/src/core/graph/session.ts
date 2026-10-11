import type { GraphDoc } from "./doc";
import { Evaluator, type NodeStatus } from "./evaluate";
import { makeThumb, type Thumb } from "./thumbs";
import type { Assets, PaperDrawing, RgbaImage } from "./types";
import type { Registry } from "./doc";

/** What one evaluation sends to the UI. */
export type SessionResult = {
  /** Status of every node, by flat id (and group id). */
  status: [string, NodeStatus][];
  /** Thumbnails of nodes that were (re)computed in this run; others keep the one the UI has. */
  thumbs: [string, Thumb][];
  /** Flat ids that have no output any more, so the UI drops their thumbnails. */
  cleared: string[];
  /** Output of the first paper node that has one: what will be plotted. */
  drawing?: PaperDrawing;
  ms: number;
};

/** Evaluation state that lives in the worker: the evaluator's cache and the loaded images. */
export class GraphSession {
  private evaluator: Evaluator;
  private assets = new Map<string, RgbaImage>();

  constructor(registry: Registry) {
    this.evaluator = new Evaluator(registry);
  }

  addAsset(key: string, image: RgbaImage) {
    this.assets.set(key, image);
  }

  get assetMap(): Assets {
    return this.assets;
  }

  run(doc: GraphDoc): SessionResult {
    const t0 = Date.now();
    const result = this.evaluator.run(doc, { assets: this.assets });
    const thumbs: [string, Thumb][] = [];
    const cleared: string[] = [];
    for (const node of result.flat.nodes) {
      const out = result.outputs.get(node.id);
      const first = out && Object.values(out)[0];
      if (!first) cleared.push(node.id);
      else if (result.status.get(node.id)?.fresh) thumbs.push([node.id, makeThumb(first)]);
    }
    const paper = result.flat.nodes.find((n) => n.type === "paper" && result.outputs.get(n.id)?.drawing);
    return {
      status: [...result.status.entries()],
      thumbs,
      cleared,
      drawing: paper && (result.outputs.get(paper.id)!.drawing as PaperDrawing),
      ms: Date.now() - t0,
    };
  }
}
