"use client";

import { useEffect, useState } from "react";
import { type Block, crosshatch, defaultPipeline, edgeSketch, generative, inkDrawing, rosette, stippling, parseBlock, parsePreset, type Preset, registry, toPreset } from "@/core/graph";

const PRESETS_KEY = "quickstep.presets";
const BLOCKS_KEY = "quickstep.blocks";

/** Presets that always exist; saved ones with the same name override them. */
export function builtInPresets(): Preset[] {
  return [
    toPreset(registry, "Portrait waves", defaultPipeline(registry)),
    toPreset(registry, "Edge sketch", edgeSketch(registry)),
    toPreset(registry, "Crosshatch", crosshatch(registry)),
    toPreset(registry, "Ink drawing", inkDrawing(registry)),
    toPreset(registry, "Stippling", stippling(registry)),
    toPreset(registry, "Spirograph", generative(registry, "spirograph")),
    toPreset(registry, "Harmonograph", generative(registry, "harmonograph")),
    toPreset(registry, "Wave spiral", generative(registry, "waveSpiral")),
    toPreset(registry, "Whirl", generative(registry, "whirl")),
    toPreset(registry, "Rosette", rosette(registry)),
  ];
}

function read<T>(key: string, parse: (json: unknown) => T): T[] {
  try {
    const list = JSON.parse(localStorage.getItem(key) ?? "[]");
    return (Array.isArray(list) ? list : []).flatMap((item) => {
      try {
        return [parse(item)];
      } catch {
        return []; // skip entries that no longer load
      }
    });
  } catch {
    return [];
  }
}

function write(key: string, list: unknown[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // storage full or blocked: the list still works for this session
  }
}

/** Saved presets and blocks, kept in this browser. */
export function useLibrary() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- storage only exists on the client
    setPresets(read(PRESETS_KEY, (j) => parsePreset(registry, j).preset));
    setBlocks(read(BLOCKS_KEY, (j) => parseBlock(registry, j).block));
  }, []);

  const byName = <T extends { name: string }>(list: T[], item: T) => [...list.filter((x) => x.name !== item.name), item].sort((a, b) => a.name.localeCompare(b.name));

  return {
    presets: [...builtInPresets().filter((b) => !presets.some((p) => p.name === b.name)), ...presets],
    blocks,
    savePreset(p: Preset) {
      const next = byName(presets, p);
      setPresets(next);
      write(PRESETS_KEY, next);
    },
    removePreset(name: string) {
      const next = presets.filter((p) => p.name !== name);
      setPresets(next);
      write(PRESETS_KEY, next);
    },
    saveBlock(b: Block) {
      const next = byName(blocks, b);
      setBlocks(next);
      write(BLOCKS_KEY, next);
    },
    removeBlock(name: string) {
      const next = blocks.filter((b) => b.name !== name);
      setBlocks(next);
      write(BLOCKS_KEY, next);
    },
  };
}

export type Library = ReturnType<typeof useLibrary>;

export function downloadJson(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
