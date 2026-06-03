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
  `{0}`, `{0;1}`, or the root `{}`). The exchange format for inputs and outputs.
  The branch-path shape has one canonical home: `TREE_PATH_RE` and the
  `isDataTreeDefault` membership test in `data-tree/tree-path.ts`. Anything asking
  "is this a tree-shaped default?" — the input-type parsers and `TreeBuilder` —
  imports that predicate rather than re-inlining the regex.
- **IO** — the inputs and outputs a definition declares. `getIO` fetches them.
- **Input param** — one declared input of a definition, parsed into a typed
  shape (`NumericInputType`, `TextInputType`, …). The union is `InputParam`.
- **Transport** — the HTTP layer talking to Rhino Compute (`fetchRhinoCompute`).
  Owns retries, backoff, timeout/abort composition, and HTTP→error-code mapping.
  Response-type-agnostic: it takes an endpoint string and a `ComputeConfig` and
  returns a caller-supplied response type (`fetchRhinoCompute<R>`). It does not
  know which response a given endpoint produces — each endpoint caller names its
  own response type. This keeps the dependency arrow pointing feature → core, so
  a second endpoint family can be added without `core` importing any feature.
- **Scheduler** — orchestrates solves over time (latest-wins / queue / parallel),
  with cancellation, retries, caching, and an observable state surface.
- **Response processor** — reads computed values out of a solve response tree.
- **Decoder** — turns a typed value (system type or Rhino geometry) into a JS
  value. Rhino geometry decoding uses a registry (`registerDecoder`).
- **Mesh batch** — the binary (SLVA) payload carrying display meshes; parsed by
  the webdisplay layer into three.js meshes. Three entry points decode it —
  `parseMeshBatch` (JSON envelope), `parseMeshBatchObject` (parsed `MeshBatch`),
  `parseMeshBatchBlob` (raw binary frame) — and all share the one public options
  type `MeshBatchParsingOptions` (`mergeByMaterial` / `applyTransforms` / `debug`).
  Telemetry timings and the envelope `fallback` merge are private to the build
  step (`BuildOptions`), never on a caller-facing surface.

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
  detects a tree-shaped default (`isDataTreeDefault`) and passes it through
  untouched; the other scalar parsers already preserved it. Pinned by the
  `tree-access defaults` block in `process-inputs.characterization.test.ts`.

- **Branch-path detection forked across three sites** _(fixed)._ "Is this value a
  tree-shaped default?" was answered by two divergent runtime predicates — the
  parser's `isTreeShapedDefault` (loose: `/^\{.*\}$/`, no array-value check) and
  `TreeBuilder`'s private `isDataTreeStructure` (strict: `/^\{[\d;]+\}$/`, arrays
  required) — plus a third inline `[\d;]*` regex in `parsePathString`. The two
  predicates could classify the same value differently. Unified on one exported
  `isDataTreeDefault` / `TREE_PATH_RE` in `data-tree/tree-path.ts`, widened to
  accept the root path `{}` (matching `parsePathString`). The parser and
  `TreeBuilder` now share the predicate, so they agree by construction on which
  values are trees. No behavior change — pinned by the existing characterization
  and `data-tree` test suites.

- **Binary definitions colliding in the solve cache** _(fixed)._ The Scheduler's
  response cache keys on `hashSolveInput(definition, dataTree)`. A binary
  (`Uint8Array`) definition was keyed on its **length alone** (`{ __u8, len }`) —
  despite the docstring claiming a sample — so two different `.gh` files of equal
  length produced the same key and one's cached solve was served for the other,
  silently, as a `fromCache: true` success. Binary definitions are now hashed over
  their **full content** (`fnv1aBytes`), prefixed `u8:<len>:<hash>`. This is the
  definition's _identity_, so correctness wins over the marginal cost of a linear
  byte pass — distinct from `stableStringify`'s deliberate sampling of a
  `Uint8Array` found _inside_ a dataTree (hashed every solve). Pinned by
  `scheduler/__tests__/stable-hash.test.ts` (equal-length and shared-endpoint
  collision regressions).

- **File handling fused decode + fetch; base64 path corrupted content** _(fixed)._
  `core/files/handle-files.ts`'s `processFiles` did two orthogonal jobs in one
  body — synchronously decoding the inline `FileData` of a compute response, and
  asynchronously fetching external `FileBaseInfo` URLs (swallowing per-file
  failures). Split into `decodeResponseFiles` (pure/sync) and `fetchRemoteFiles`
  (async, deliberate swallow), composed by a thin `processFiles`; public API
  unchanged. Adding a real test surface (`core/files/__tests__/handle-files.test.ts`)
  immediately surfaced a latent bug: the base64 branch wrapped the decoded bytes
  in `new Uint8Array(bites.buffer)`, discarding the view's `byteOffset`/
  `byteLength` and exposing the whole (pooled) backing buffer as corrupt content.
  Now uses the correctly-bounded view `decodeBase64ToBinary` already returns.
  The remote-fetch swallow (one dead URL degrades, never aborts the batch) is now
  pinned as intentional.

- **Mesh batch entry points had drifting, leaky options** _(fixed)._ The three
  `parseMeshBatch*` functions each inlined their own options literal, drifting
  apart (`parseMeshBatchObject` even exposed internal `parseTime`/`perfStart`
  timings as public options), while the real contract hid in the private
  `BuildOptions`. Unified all three on the existing public `MeshBatchParsingOptions`;
  the two that historically also took `scaleFactor` keep it via
  `MeshBatchParsingOptions & { scaleFactor? }`; timings now thread through a
  private `ParseTelemetry` arg, never a caller surface. Behavior-preserving —
  pinned by the existing `parseMeshBatchObject`/`parseMeshBatch` suites plus new
  direct tests for the previously-untested `parseMeshBatchBlob`.

- **`serverUrl` validated twice, with rules that had drifted** _(fixed)._ The same
  URL was checked in `GrasshopperClient.normalizeComputeConfig` and again in the
  `ComputeServerStats` constructor (the client constructs `ComputeServerStats`
  with the already-validated URL). Neither was a superset: the client rejected the
  default public endpoint but skipped the `http(s)://` scheme check; the stats
  constructor checked the scheme but allowed the public endpoint — so a bad URL
  threw a different message from a different place depending on path, and each
  validator missed a rule the other had. Extracted one `validateServerUrl` in
  `core/server/validate-server-url.ts` enforcing the **union** of all rules
  (non-empty, scheme, parseable, not-public-endpoint, strip trailing slash); both
  call sites delegate. `ComputeServerStats` is publicly exported and standalone-
  constructible, so its validation is load-bearing — this unifies, it doesn't
  remove. Pinned by `core/server/__tests__/validate-server-url.test.ts` (neither
  validator had any test before).

- **Scheduler settle-once guard was hand-rolled at every settle site** _(fixed)._
  A solve promise can be settled from four concurrent sources — the executor
  resolving, the executor rejecting, `supersede`, and `cancelAll` — and a JS
  promise silently ignores a second settle, so the `item.settled` flag is
  load-bearing: it stops a late executor success from firing `onSettle` twice and
  clobbering `_lastResult`/`_lastError` out of order after a supersede/cancel. The
  flag itself is **deep and correct** (an architecture review had mis-flagged the
  "checked in 4 places" as accidental complexity — it's concurrency correctness,
  not shallowness). The legibility risk was that each site re-implemented the
  `if (settled) {...}` dance by hand, so a future fifth settle path could forget
  the guard. Centralized into `settleError` / `settleSuccess` private helpers that
  own the settle-once invariant and return whether they won (so callers fire their
  hook only on the winning settle). Behavior-preserving — pinned by the existing
  21-test scheduler suite (supersede-then-late-rejection, `cancelAll`). Any new
  settle path must go through these helpers.

## Known follow-ups

- **`scaleFactor` is applied in two places.** `buildMeshesFromParsed` scales meshes
  when `scaleFactor !== 1` (used by `parseMeshBatchObject`/`Blob`), _and_ the
  webdisplay orchestrator re-scales the returned meshes itself
  (`webdisplay-parser.ts`, from `modelunits`). The real extraction path goes
  through the orchestrator, so the in-parser `scaleFactor` is effectively dead
  there — but a caller using `parseMeshBatchObject` directly _and_ the orchestrator
  would double-scale. Deferred: pick one scaling home (likely the orchestrator,
  which owns unit→scale) and remove the other.
