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
  independent of type) and runs *before* type dispatch. Then the parser for the
  canonical type produces the typed param. Parse failure is caught at the
  registry boundary and paired with the parser's own fallback param.

## Known-suspicious behavior (do not "fix" without a decision)

- **Tree-shaped defaults reaching scalar parsers.** When an input is
  tree-access (`treeAccess: true` or `atMost > 1`), `normalizeDefault` preserves
  the default as a tree object. The type parsers were written assuming a
  scalar-or-array default, so a tree-shaped default currently collapses to
  `undefined` for `Number` (step size then derives from min/max) and passes
  through untouched for other types. This is the *current shipped behavior* and
  is pinned by characterization tests. It may be a latent bug; if so, fix it in a
  dedicated change, not folded into an unrelated refactor.
