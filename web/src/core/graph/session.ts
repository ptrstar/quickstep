import type { GraphDoc } from "./doc";
import { Evaluator, type NodeStatus } from "./evaluate";
import { OUTPUT_TYPE } from "./nodes";
import { makeThumb, type Thumb } from "./thumbs";
import type { Assets, PaperDrawing, RgbaImage } from "./types";
import type { Registry } from "./doc";
import type { Font } from "../text/font";

/** What one evaluation sends to the UI. */
export type SessionResult = {
  /** Status of every node, by flat id (and group id). */
  status: [string, NodeStatus][];
  /** Thumbnails of nodes that were (re)computed in this run; others keep the one the UI has. */
  thumbs: [string, Thumb][];
  /** Flat ids that have no output any more, so the UI drops their thumbnails. */
  cleared: string[];
  /** What will be plotted: the drawing wired into the output knob. */
  drawing?: PaperDrawing;
  ms: number;
};

/** Evaluation state that lives in the worker: the evaluator's cache and the loaded images. */
export class GraphSession {
  private evaluator: Evaluator;
  private assets = new Map<string, RgbaImage>();
  private fonts = new Map<string, Font>();

  constructor(private readonly registry: Registry) {
    this.evaluator = new Evaluator(registry);
  }

  addAsset(key: string, image: RgbaImage) {
    this.assets.set(key, image);
  }

  addFont(key: string, font: Font) {
    this.fonts.set(key, font);
  }

  get assetMap(): Assets {
    return this.assets;
  }

  run(doc: GraphDoc): SessionResult {
    const t0 = Date.now();
    const result = this.evaluator.run(doc, { assets: this.assets, fonts: this.fonts });
    const thumbs: [string, Thumb][] = [];
    const cleared: string[] = [];
    for (const node of result.flat.nodes) {
      if (!this.registry.get(node.type)?.outputs.length) continue; // e.g. the output knob: nothing to show
      const out = result.outputs.get(node.id);
      const first = out && Object.values(out)[0];
      if (!first) cleared.push(node.id);
      else if (result.status.get(node.id)?.fresh) thumbs.push([node.id, makeThumb(first)]);
    }
    const output = result.flat.nodes.find((n) => n.type === OUTPUT_TYPE && n.path.length === 0);
    const feed = output && result.flat.edges.find((e) => e.to.node === output.id);
    const drawing = feed && (result.outputs.get(feed.from.node)?.[feed.from.port] as PaperDrawing | undefined);
    return {
      status: [...result.status.entries()],
      thumbs,
      cleared,
      drawing,
      ms: Date.now() - t0,
    };
  }
}
