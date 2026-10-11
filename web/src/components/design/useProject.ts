"use client";

import { useEffect, useReducer } from "react";
import { defaultPipeline, ensureOutput, type GraphDoc, type GraphPath, type NodeId, registry, updateAt, validPath } from "@/core/graph";

const STORAGE_KEY = "quickstep.project";
const HISTORY = 100;
const COALESCE_MS = 800;

export type ProjectState = {
  name: string;
  doc: GraphDoc;
  past: GraphDoc[];
  future: GraphDoc[];
  /** Group the editor is inside ([] = top level). */
  path: GraphPath;
  selection: NodeId[];
  drawer: boolean;
  /** Consecutive edits with the same key (a slider drag) become one undo step. */
  coalesce?: { key: string; at: number };
};

type Action =
  | { type: "edit"; change: (g: GraphDoc) => GraphDoc; coalesce?: string; select?: NodeId[]; at?: GraphPath }
  | { type: "rename"; name: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "select"; ids: NodeId[]; drawer?: boolean }
  | { type: "drawer"; open: boolean }
  | { type: "enter"; id: NodeId }
  | { type: "exit"; depth: number }
  | { type: "load"; doc: GraphDoc; name: string };

function fresh(doc: GraphDoc, name: string): ProjectState {
  return { name, doc: ensureOutput(registry, doc), past: [], future: [], path: [], selection: [], drawer: false };
}

function reducer(s: ProjectState, a: Action): ProjectState {
  switch (a.type) {
    case "edit": {
      const doc = ensureOutput(registry, updateAt(s.doc, a.at ?? s.path, a.change));
      if (doc === s.doc) return s;
      const now = Date.now();
      const merge = a.coalesce && s.coalesce?.key === a.coalesce && now - s.coalesce.at < COALESCE_MS;
      return {
        ...s,
        doc,
        past: merge ? s.past : [...s.past.slice(-HISTORY + 1), s.doc],
        future: [],
        coalesce: a.coalesce ? { key: a.coalesce, at: now } : undefined,
        selection: a.select ?? s.selection,
        path: validPath(doc, s.path),
      };
    }
    case "undo": {
      const prev = s.past.at(-1);
      if (!prev) return s;
      return { ...s, doc: prev, past: s.past.slice(0, -1), future: [s.doc, ...s.future], coalesce: undefined, path: validPath(prev, s.path) };
    }
    case "redo": {
      const [next, ...rest] = s.future;
      if (!next) return s;
      return { ...s, doc: next, past: [...s.past, s.doc], future: rest, coalesce: undefined, path: validPath(next, s.path) };
    }
    case "select":
      return { ...s, selection: a.ids, drawer: a.drawer ?? (a.ids.length === 1 ? s.drawer : false) };
    case "drawer":
      return { ...s, drawer: a.open };
    case "enter":
      return { ...s, path: validPath(s.doc, [...s.path, a.id]), selection: [], drawer: false };
    case "exit":
      return { ...s, path: s.path.slice(0, a.depth), selection: [], drawer: false };
    case "load":
      return fresh(a.doc, a.name);
    case "rename":
      return { ...s, name: a.name };
  }
}

/** The graph being edited, with undo, group navigation, selection, and autosave in the browser. */
export function useProject() {
  const [state, dispatch] = useReducer(reducer, undefined, () => fresh(defaultPipeline(registry), "Portrait waves"));

  // restore the last session (graph only; images are not stored)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (saved?.doc?.nodes) dispatch({ type: "load", doc: saved.doc, name: saved.name ?? "Untitled" });
    } catch {
      // no storage or bad data: keep the default
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: state.name, doc: state.doc }));
      } catch {
        // storage full or blocked: the session still works
      }
    }, 400);
    return () => clearTimeout(t);
  }, [state.doc, state.name]);

  return {
    ...state,
    /** Changes the graph at the current path (or at `opts.at`). */
    edit: (change: (g: GraphDoc) => GraphDoc, opts: { coalesce?: string; select?: NodeId[]; at?: GraphPath } = {}) =>
      dispatch({ type: "edit", change, ...opts }),
    undo: () => dispatch({ type: "undo" }),
    redo: () => dispatch({ type: "redo" }),
    select: (ids: NodeId[], drawer?: boolean) => dispatch({ type: "select", ids, drawer }),
    setDrawer: (open: boolean) => dispatch({ type: "drawer", open }),
    enter: (id: NodeId) => dispatch({ type: "enter", id }),
    exit: (depth: number) => dispatch({ type: "exit", depth }),
    load: (doc: GraphDoc, name: string) => dispatch({ type: "load", doc, name }),
    rename: (name: string) => dispatch({ type: "rename", name }),
  };
}

export type Project = ReturnType<typeof useProject>;
