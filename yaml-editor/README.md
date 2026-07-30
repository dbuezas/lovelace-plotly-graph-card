# Demo

This demo is deployed to [monaco-yaml.js.org](https://monaco-yaml.js.org). It shows how
`monaco-editor` and `monaco-yaml` can be used with
[Webpack 5](https://webpack.js.org/concepts/entry-points).

## Table of Contents

- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Running](#running)

## Prerequisites

- [NodeJS](https://nodejs.org) 16 or higher
- [npm](https://github.com/npm/cli) 8.1.2 or higher

## Setup

To run the project locally, clone the repository and set it up:

```sh
git clone https://github.com/remcohaszing/monaco-yaml
cd monaco-yaml
npm ci
```

## Running

To start it, simply run:

```sh
npm start
```

## Schema generation

The checked-in `src/schema.json` combines the card-specific configuration
types with Plotly's runtime schema from `plotly.js/dist/plot-schema.json`.
Only traces registered in `src/plotly.ts` are included.

From the repository root, install both lockfiles and run:

```sh
npm ci
npm ci --prefix yaml-editor
npm run schema --prefix yaml-editor
npm test --prefix yaml-editor
```

`npm run build` regenerates the schema before building the editor. CI also
checks that the generated file is reproducible and committed.

The demo will open in your browser.
