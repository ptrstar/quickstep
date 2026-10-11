/** Paper sizes in mm, portrait. */
export const PAPER_SIZES: Record<string, { label: string; width: number; height: number }> = {
  a6: { label: "A6 · 105 × 148", width: 105, height: 148 },
  a5: { label: "A5 · 148 × 210", width: 148, height: 210 },
  a4: { label: "A4 · 210 × 297", width: 210, height: 297 },
  custom: { label: "Custom", width: 0, height: 0 },
};

export function paperSize(p: Record<string, unknown>): { width: number; height: number } {
  const preset = PAPER_SIZES[p.size as string] ?? PAPER_SIZES.a6;
  const base = p.size === "custom" ? { width: p.width as number, height: p.height as number } : preset;
  const [short, long] = [Math.min(base.width, base.height), Math.max(base.width, base.height)];
  return p.orientation === "landscape" ? { width: long, height: short } : { width: short, height: long };
}
