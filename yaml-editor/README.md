# YAML editor

The card's YAML editor uses Monaco and a generated configuration schema.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Running](#running)

## Prerequisites

- Node.js 22 or newer; CI uses Node.js 24.
- npm

## Setup

To run the project locally, clone the repository and set it up:

```sh
git clone https://github.com/dbuezas/lovelace-plotly-graph-card
cd lovelace-plotly-graph-card
npm ci
npm ci --prefix yaml-editor
```

## Running

To start it, simply run:

```sh
npm start --prefix yaml-editor
```

## Schema generation

The checked-in `src/schema.json` combines the card-specific configuration
types with Plotly's runtime schema from `plotly.js/dist/plot-schema.json`.
Only traces registered in `src/plotly.ts` are included.
Trace-specific layout options are included at their matching layout or subplot
level. Subplots without registered trace types are omitted from suggestions.
Regenerate the schema after changing either Plotly or the trace registrations.

From the repository root, install both lockfiles and run:

```sh
npm ci
npm ci --prefix yaml-editor
npm run schema --prefix yaml-editor
npm test --prefix yaml-editor
```

`npm run build --prefix yaml-editor` regenerates the schema before building the editor. CI also
checks that the generated file is reproducible and committed.

The development editor opens in your browser when started.
