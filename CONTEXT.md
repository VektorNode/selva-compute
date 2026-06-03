# CONTEXT

Domain vocabulary for `@selvajs/compute`. These are the names we use for the
concepts and seams in the codebase. Keep them consistent — when a module is
named after a concept, it should be the concept named here.

## Core concepts

- **Definition** — a Grasshopper `.gh` file, identified by a URL (pointer) or
  supplied as base64/binary. The thing we solve.
- **Solve** — sending a definition + inputs to Rhino Compute and getting back
  computed values. The central operation.
- **Data tree** — Grasshopper's hierarchical value structure (branch paths like
  `{0}`, `{0;1}`). The exchange format for inputs and outputs.
- **IO** — the inputs and outputs a definition declares. `getIO` fetches them.
- **Input param** — one declared input of a definition, parsed into a typed
  shape (`NumericInputType`, `TextInputType`, …). The union is `InputParam`.
- **Transport** — the HTTP layer talking to Rhino Compute (`fetchRhinoCompute`).
  Owns retries, backoff, timeout/abort composition, and HTTP→error-code mapping.
- **Scheduler** — orchestrates solves over time (latest-wins / queue / parallel),
  with cancellation, retries, caching, and an observable state surface.
- **Response processor** — reads computed values out of a solve response tree.
- **Decoder** — turns a typed value (system type or Rhino geometry) into a JS
  value. Rhino geometry decoding uses a registry (`registerDecoder`).
- **Mesh batch** — the binary (SLVA) payload carrying display meshes; parsed by
  the webdisplay layer into three.js meshes.

## Seams

- **Input-type parser** — the per-param-type adapter that turns one raw input
  schema into one typed `InputParam`. One parser owns everything about its type:
  value coercion, type-specific fields (e.g. numeric step size), and its own
  safe fallback when input is bad. Registered by `paramType`. This is the seam;
  the registry of parsers is where new param types plug in.

  Pipeline order: a **shared** `normalizeDefault` step flattens the raw
  `innerTree` default (flat-vs-tree decided by `treeAccess` / `atMost`,
  independent of type) and runs _before_ type dispatch. Then the parser for the
  canonical type produces the typed param. Parse failure is caught at the
  registry boundary and paired with the parser's own fallback param.

## Resolved issues

- **Tree-shaped defaults reaching scalar parsers** _(fixed)._ For a tree-access
  input (`treeAccess: true` or `atMost > 1`), `normalizeDefault` keeps the
  default as a `DataTreeDefault` (object keyed by branch paths like `{0}`).
  `TreeBuilder.fromInputParams` reads exactly that shape. The numeric parser used
  to run scalar coercion over the tree object and silently collapse it to
  `undefined` — dropping a tree-access slider's default. The numeric parser now
  detects a tree-shaped default (`isTreeShapedDefault`) and passes it through
  untouched; the other scalar parsers already preserved it. Pinned by the
  `tree-access defaults` block in `process-inputs.characterization.test.ts`.
