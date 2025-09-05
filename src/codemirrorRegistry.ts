// codemirrorRegistry.ts
import {
  EditorView,
  Decoration,
  ViewUpdate,
} from "@codemirror/view";
import {
  EditorState,
  Transaction,
  StateEffect,
} from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

export type RegistryType = "dependency" | "function" | "variable";

export interface RegistryEntry {
  name: string;
  description: string;
  value: any;
}

// The grand unified registry ✨
export const registry: Record<RegistryType, Record<string, RegistryEntry>> = {
  dependency: {
    doc: {
      name: "Document",
      description: "Triggers when the document text changes.",
      value: "doc",
    },
    selection: {
      name: "Selection",
      description: "Triggers when the selection or cursor changes.",
      value: "selection",
    },
    viewport: {
      name: "Viewport",
      description: "The visible region of the editor content.",
      value: "viewport",
    },
    editable: {
      name: "Editable",
      description: "Whether the editor is in read-only or editable mode.",
      value: "editable",
    },
    language: {
      name: "Language",
      description: "The active language mode for syntax highlighting.",
      value: "language",
    },
    theme: {
      name: "Theme",
      description: "The active visual theme applied to the editor.",
      value: "theme",
    },
  },

  function: {
    createDiv: {
      name: "Create Div",
      description: "Creates a new <div> element tied to the editor.",
      value: (view: EditorView) => {
        const el = document.createElement("div");
        el.classList.add("cm-custom-plugin");
        return el;
      },
    },
    domAtPos: {
      name: "DOM at Position",
      description: "Finds the DOM node and offset at a given document position.",
      value: (view: EditorView, pos: number) => view.domAtPos(pos),
    },
    scrollToPos: {
      name: "Scroll Into View",
      description: "Scrolls the editor so a given position is visible.",
      value: (view: EditorView, pos: number) =>
        view.dispatch({ effects: EditorView.scrollIntoView(pos) }),
    },
    getLine: {
      name: "Get Line Text",
      description: "Fetches the full text of the line at a given position.",
      value: (state: EditorState, pos: number) => {
        const line = state.doc.lineAt(pos);
        return line.text;
      },
    },
    syntaxTreeAt: {
      name: "Syntax Tree At Position",
      description: "Gets the syntax node at a given document position.",
      value: (state: EditorState, pos: number) =>
        syntaxTree(state).resolve(pos),
    },
    markRange: {
      name: "Mark Range",
      description: "Create a highlighted range using decorations.",
      value: (from: number, to: number, className = "cm-marked") =>
        Decoration.mark({ class: className }).range(from, to),
    },
    updateListener: {
      name: "Update Listener",
      description: "Creates a listener that runs on every view update.",
      value: (fn: (update: ViewUpdate) => void) =>
        EditorView.updateListener.of(fn),
    },
  },

  variable: {
    editorView: {
      name: "Editor View",
      description: "The current EditorView instance (DOM, dispatch, etc).",
      value: EditorView,
    },
    editorState: {
      name: "Editor State",
      description: "The current EditorState (doc, selection, facets).",
      value: EditorState,
    },
    transaction: {
      name: "Transaction",
      description: "Describes and applies changes to the editor state.",
      value: Transaction,
    },
    stateEffect: {
      name: "State Effect",
      description: "A mechanism for applying side effects in transactions.",
      value: StateEffect,
    },
    decoration: {
      name: "Decoration",
      description: "Utilities for inline, line, and widget decorations.",
      value: Decoration,
    },
  },
};


/**
 * Safe lookup helper
 */
export function getRegistry(
  type: RegistryType,
  id: string
): RegistryEntry {
  const typeRegistry = registry[type];
  if (!typeRegistry) {
    throw new Error(`Unknown registry type: ${type}`);
  }
  const entry = typeRegistry[id];
  if (!entry) {
    throw new Error(`Registry entry not found for type "${type}" and id "${id}"`);
  }
  return entry;
}


export interface RegistryOption {
  label: string;       // display name
  value: string;       // id key
  type: RegistryType;  // dependency | function | variable
  description: string; // tooltip
}

export function getRegistryOptions(type: RegistryType): RegistryOption[] {
  return Object.entries(registry[type]).map(([id, entry]) => ({
    label: entry.name,
    value: id,
    type,
    description: entry.description,
  }));
}
