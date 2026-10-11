export type Point = { x: number; y: number };

/** A pen-down polyline. */
export type Stroke = Point[];

/** Strokes in drawing order, in mm. */
export type Drawing = Stroke[];
