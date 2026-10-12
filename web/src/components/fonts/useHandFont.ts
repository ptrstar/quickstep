"use client";

import { useEffect, useState } from "react";
import { emptyHandFont, type HandFont } from "@/core/text/handwriting";

const STORAGE_KEY = "quickstep.handfont";

/** The key under which the handwriting font is known to the graph (fixed, so nodes keep it). */
export const HAND_FONT_KEY = "hand:mine";

export function loadHandFont(): HandFont | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (saved && typeof saved.name === "string" && saved.glyphs) return { ...emptyHandFont(saved.name), ...saved };
  } catch {
    // nothing stored, or storage blocked
  }
  return undefined;
}

/** The handwriting font being captured, saved in this browser after every change. */
export function useHandFont() {
  const [font, setFont] = useState<HandFont>(() => emptyHandFont());

  useEffect(() => {
    const saved = loadHandFont();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- storage only exists on the client
    if (saved) setFont(saved);
  }, []);

  const update = (next: HandFont) => {
    setFont(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage full or blocked: the font still works for this session
    }
  };
  return [font, update] as const;
}
