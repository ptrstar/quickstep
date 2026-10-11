import type { Point, Stroke } from "../geometry";
import type { Instruction } from "./instructions";

export type Trace = {
  /** Pen-down polylines in full steps, starting where the pen went down. */
  strokes: Stroke[];
  /** Final position in full steps, relative to the start. */
  end: Point;
  penDown: boolean;
  moves: number;
};

/** Follows the pen through a program, ignoring timing. Pen starts up at (0, 0). */
export function trace(instructions: Iterable<Instruction>): Trace {
  const strokes: Stroke[] = [];
  let x = 0;
  let y = 0;
  let penDown = false;
  let moves = 0;
  let current: Stroke | undefined;

  for (const ins of instructions) {
    if (ins.op === "pen") {
      penDown = !penDown;
      current = penDown ? [{ x, y }] : undefined;
      if (current) strokes.push(current);
    } else if (ins.op === "move") {
      x += ins.dx;
      y += ins.dy;
      moves++;
      current?.push({ x, y });
    }
  }
  return { strokes, end: { x, y }, penDown, moves };
}
