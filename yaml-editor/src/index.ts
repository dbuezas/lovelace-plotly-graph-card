import { type JSONSchemaForSchemaStoreOrgCatalogFiles } from "@schemastore/schema-catalog";
import {
  editor,
  languages,
  MarkerSeverity,
  type Position,
  Range,
  Uri,
} from "monaco-editor";
import * as monaco from "monaco-editor";
import { ILanguageFeaturesService } from "monaco-editor/esm/vs/editor/common/services/languageFeatures.js";
import { OutlineModel } from "monaco-editor/esm/vs/editor/contrib/documentSymbols/browser/outlineModel.js";
import { StandaloneServices } from "monaco-editor/esm/vs/editor/standalone/browser/standaloneServices.js";
import { configureMonacoYaml, type SchemasSettings } from "monaco-yaml";

import "./index.css";
import schema from "./schema.json";

window.MonacoEnvironment = {
  getWorker(moduleId, label) {
    switch (label) {
      case "editorWorkerService":
        return new Worker(
          new URL("monaco-editor/esm/vs/editor/editor.worker", import.meta.url),
        );
      case "yaml":
        return new Worker(new URL("monaco-yaml/yaml.worker", import.meta.url));
      default:
        throw new Error(`Unknown label ${label}`);
    }
  },
};

const defaultSchema: SchemasSettings = {
  uri: window.location.href,
  schema,
  fileMatch: ["plotly-graph.yaml"],
};

const monacoYaml = configureMonacoYaml(monaco, {
  schemas: [defaultSchema],
  completion: true,
  format: true,
  hover: true,
  validate: true,
});

function showToast(message: string) {
  const toastContainer = document.getElementById("toast-container")!;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerText = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("show");
  }, 100);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 500); // Remove after animation
  }, 3000);
}

if (localStorage["plotly-graph"])
  showToast("Recovered yaml from local storage");

const value =
  localStorage["plotly-graph"] ||
  `type: custom:plotly-graph
entities:
  - entity: sensor.x
  - entity: sensor.y
`;

const ed = editor.create(document.getElementById("editor")!, {
  automaticLayout: true,
  model: editor.createModel(value, "yaml", Uri.parse("plotly-graph.yaml")),
  theme: window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "vs-dark"
    : "vs-light",
  quickSuggestions: {
    other: true,
    comments: false,
    strings: true,
  },
  formatOnType: true,
});

/**
 * Get the document symbols that contain the given position.
 *
 * @param symbols
 *   The symbols to iterate.
 * @param position
 *   The position for which to filter document symbols.
 * @yields
 * The document symbols that contain the given position.
 */
function* iterateSymbols(
  symbols: languages.DocumentSymbol[],
  position: Position,
): Iterable<languages.DocumentSymbol> {
  for (const symbol of symbols) {
    if (Range.containsPosition(symbol.range, position)) {
      yield symbol;
      if (symbol.children) {
        yield* iterateSymbols(symbol.children, position);
      }
    }
  }
}

ed.onDidChangeModelContent(() => {
  localStorage["plotly-graph"] = ed.getValue();
});

ed.onDidChangeCursorPosition(async (event) => {
  const breadcrumbs = document.getElementById("breadcrumbs")!;
  const { documentSymbolProvider } = StandaloneServices.get(
    ILanguageFeaturesService,
  );
  const outline = await OutlineModel.create(
    documentSymbolProvider,
    ed.getModel()!,
  );
  const symbols = outline.asListOfDocumentSymbols();
  while (breadcrumbs.lastChild) {
    breadcrumbs.lastChild.remove();
  }
  for (const symbol of iterateSymbols(symbols, event.position)) {
    const breadcrumb = document.createElement("span");
    breadcrumb.setAttribute("role", "button");
    breadcrumb.classList.add("breadcrumb");
    breadcrumb.textContent = symbol.name;
    breadcrumb.title = symbol.detail;
    if (symbol.kind === languages.SymbolKind.Array) {
      breadcrumb.classList.add("array");
    } else if (symbol.kind === languages.SymbolKind.Module) {
      breadcrumb.classList.add("object");
    }
    breadcrumb.addEventListener("click", () => {
      ed.setPosition({
        lineNumber: symbol.range.startLineNumber,
        column: symbol.range.startColumn,
      });
      ed.focus();
    });
    breadcrumbs.append(breadcrumb);
  }
});

editor.onDidChangeMarkers(([resource]) => {
  const problems = document.getElementById("problems")!;
  const markers = editor.getModelMarkers({ resource });
  while (problems.lastChild) {
    problems.lastChild.remove();
  }
  for (const marker of markers) {
    if (marker.severity === MarkerSeverity.Hint) {
      continue;
    }
    const wrapper = document.createElement("div");
    wrapper.setAttribute("role", "button");
    const codicon = document.createElement("div");
    const text = document.createElement("div");
    wrapper.classList.add("problem");
    codicon.classList.add(
      "codicon",
      marker.severity === MarkerSeverity.Warning
        ? "codicon-warning"
        : "codicon-error",
    );
    text.classList.add("problem-text");
    text.textContent = marker.message;
    wrapper.append(codicon, text);
    wrapper.addEventListener("click", () => {
      ed.setPosition({
        lineNumber: marker.startLineNumber,
        column: marker.startColumn,
      });
      ed.focus();
    });
    problems.append(wrapper);
  }
});
