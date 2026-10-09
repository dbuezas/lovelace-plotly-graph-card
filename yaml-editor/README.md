# YAML editor

The card's YAML editor uses Monaco and a generated configuration schema.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Running](#running)

## Prerequisites

- [Bun](https://bun.sh)

## Setup

To run the project locally, clone the repository and set it up:

```sh
git clone https://github.com/dbuezas/lovelace-plotly-graph-card
cd lovelace-plotly-graph-card
bun install
bun install --cwd yaml-editor
```

## Running

To start it, simply run:

```sh
bun run --cwd yaml-editor start
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
bun install
bun install --cwd yaml-editor
bun run --cwd yaml-editor schema
bun run --cwd yaml-editor test
```

`bun run --cwd yaml-editor build` regenerates the schema before building the editor. CI also
checks that the generated file is reproducible and committed.

The development editor opens in your browser when started.
