declare module 'monaco-editor/esm/vs/editor/common/services/languageFeatures.js' {
  export const ILanguageFeaturesService: { documentSymbolProvider: unknown }
}

declare module 'monaco-editor/esm/vs/editor/contrib/documentSymbols/browser/outlineModel.js' {
  import { type editor, type languages } from 'monaco-editor'

  export abstract class OutlineModel {
    static create(registry: unknown, model: editor.ITextModel): Promise<OutlineModel>

    asListOfDocumentSymbols(): languages.DocumentSymbol[]
  }
}

declare module 'monaco-editor/esm/vs/editor/standalone/browser/standaloneServices.js' {
  export const StandaloneServices: {
    get: (id: unknown) => { documentSymbolProvider: unknown }
  }
}
