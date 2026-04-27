<!-- Badges -->
<div align="center">

[![npm version](https://img.shields.io/npm/v/@selvajs/compute.svg)](https://www.npmjs.com/package/@selvajs/compute)
[![npm downloads](https://img.shields.io/npm/dm/@selvajs/compute.svg)](https://www.npmjs.com/package/@selvajs/compute)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![GitHub Repository](https://img.shields.io/badge/GitHub-VektorNode/selva--compute-blue?logo=github)](https://github.com/VektorNode/selva-compute)

</div>

# @selvajs/compute

An intermediate-level TypeScript framework for building web applications with Rhino Compute and Grasshopper.

`@selvajs/compute` simplifies the process of communicating with Rhino Compute, handling Grasshopper definitions, and visualizing results in the browser with Three.js.

## Installation

```bash
npm install @selvajs/compute three
```

_(Note: `three` is a peer dependency if you use the visualization features)_

## Why this project exists

`@selvajs/compute` provides a type-safe, production-ready foundation for building with Rhino Compute:

- **Type-safe API** — Full TypeScript with structured error codes and rich error context.
- **High-level client** — `GrasshopperClient` for one-off solves, `client.createScheduler()` for any UI that fires solves frequently.
- **Robust transport** — Configurable timeout, caller-supplied `AbortSignal`, exponential-backoff retries on transient errors, and `Retry-After` honored on 429.
- **Slider-friendly** — `latest-wins` scheduling aborts stale solves when newer values arrive. Optional response cache makes repeated inputs instant.
- **Ready-to-use visualization** — Integrated Three.js setup with `initThree()` and configurable rendering options.

Whether you're building a simple solver, a slider-driven configurator, or a long-running job submission flow, `@selvajs/compute` handles the plumbing so you can focus on your Grasshopper definitions.

> **What this is not:** a job queue. For solves longer than a couple of
> minutes, run this library server-side behind your own queue
> (BullMQ / SQS / Cloud Tasks) and expose a status endpoint to the browser.

> **Note:** The library currently focuses on the Grasshopper endpoint but is designed to support other Rhino Compute endpoints in future releases.

## Quickstart

Every solve in `@selvajs/compute` goes through a **scheduler**. The scheduler
handles cancellation, retries, loading state, and (optionally) a response cache
— things every real app needs and shouldn't have to rebuild.

```ts
import { GrasshopperClient, TreeBuilder, GrasshopperResponseProcessor } from '@selvajs/compute';

const client = await GrasshopperClient.create({
	serverUrl: 'http://localhost:6500',
	apiKey: 'your-api-key'
});

// Configure the scheduler for your workload (see "Configuring the scheduler" below).
const scheduler = client.createScheduler({ mode: 'latest-wins', timeoutMs: 30_000 });

// Inspect the definition's inputs once, build a data tree.
const io = await client.getIO('my-definition.gh');
const inputTree = TreeBuilder.fromInputParams(io.inputs);

// Solve. Returns a Promise — call it as often as you like.
const result = await scheduler.solve('my-definition.gh', inputTree);
const { values } = new GrasshopperResponseProcessor(result).getValues();
```

Wire the scheduler's state into your UI for spinners and disabled buttons:

```ts
scheduler.subscribe(() => {
	showSpinner = scheduler.isSolving;
	disableSubmit = scheduler.hasPending;
});
```

And handle expected cancellations gracefully — when newer values supersede an
in-flight solve, or when the user aborts:

```ts
scheduler.solve(definition, inputTree).catch((err) => {
	if (/superseded|aborted/i.test(err.message)) return; // expected, not an error
	showError(err);
});
```

## Configuring the scheduler

The scheduler is one API with two knobs that matter — `mode` and `timeoutMs` —
plus a couple of optional ones. Pick the row that matches what the user is
doing in your UI:

| Workload | `mode` | `timeoutMs` | `retry` | Notes |
|---|---|---|---|---|
| **Slider scrubs / live previews** | `'latest-wins'` | `30_000` | default | Aborts in-flight solves when newer values arrive. Add `cache: { ttlMs: 60_000 }` for instant repeats. |
| **Submit / long-running jobs** | `'queue'` | `0` (no timeout) | `{ attempts: 1 }` | Serial queue. Pass a caller `signal` so users can hit Cancel. Bump proxy idle timeouts (see below). |
| **Background / batch parallel** | `'parallel'` | `60_000` | `{ attempts: 2 }` | Fires solves concurrently up to `maxConcurrent` (default 4). |

You can create multiple schedulers from one client — typically one per UI
surface. They share the connection pool but their queues, cancel scopes, and
caches are independent:

```ts
const previewScheduler = client.createScheduler({ mode: 'latest-wins', timeoutMs: 30_000 });
const submitScheduler  = client.createScheduler({ mode: 'queue', timeoutMs: 0, retry: { attempts: 1 } });
```

### Cancellation

Pass a per-call `signal` to cancel just that solve, or call `cancelAll()` to
cancel everything (e.g. on route change or component unmount):

```ts
const ctrl = new AbortController();
scheduler.solve(definition, tree, { signal: ctrl.signal });

// Later:
ctrl.abort();          // cancel just this call
scheduler.cancelAll(); // cancel everything in flight + pending
scheduler.dispose();   // cancel everything and tear down the scheduler
```

### Long jobs behind a proxy

Cloudflare's default idle timeout is 100s; AWS ALB's is 60s; nginx is 60s.
If your Compute server is behind any of them, those values must be bumped
before you can run long solves through the browser — the library cannot work
around proxy timeouts.

For solves longer than ~2 minutes, the safer architecture is to run this
library **server-side** behind your own job queue (BullMQ / SQS / Cloud Tasks)
and expose a status endpoint to the browser.

## Requirements

### Core Requirements

- **Node.js** >= 20
- **three** >= 0.179.0 (required for visualization features)

### Rhino Compute Compatibility

`@selvajs/compute` works with both standard Rhino Compute and enhanced versions:

**Standard Rhino Compute** – The [official McNeel repository](https://github.com/mcneel/compute.rhino3d) works for basic Grasshopper solving with core features.

**Enhanced Setup** (Recommended) – Unlock advanced features:

1. **Selva Rhino Plugin** – Grasshopper plugin that simplifies building Three.js visualizations and exporting results directly from Grasshopper. [Download from Food4Rhino](https://www.food4rhino.com/en/app/selva?lang=en). Detailed documentation will be available when the Selva project is open-sourced.
2. **Custom Compute Server** – Our [custom branch](https://github.com/VektorNode/compute.rhino3d) enables:
   - **Input Grouping** – Organize inputs with the `groupName` property
   - **Persistent IDs** – Uniquely identify inputs across definition changes using Grasshopper object GUIDs

> Features requiring the enhanced setup will be clearly marked in the documentation.

## Troubleshooting

### `Network error: Failed to fetch`

The browser couldn't reach the server. Check, in order:

1. **Server is running** — `curl http://localhost:6500/healthcheck` should return
   a 200.
2. **CORS** — if your Compute server is on a different origin than your app,
   the server must send `Access-Control-Allow-Origin`. Standard Rhino Compute
   does **not** ship with CORS enabled; you'll need to put it behind a proxy
   that adds the headers, or use the [VektorNode custom branch](https://github.com/VektorNode/compute.rhino3d).
3. **Mixed content** — an HTTPS app can't fetch from an HTTP server. Either
   serve Compute over HTTPS or develop locally on HTTP.
4. **API key** — you'll see the same error if your `apiKey` is missing for a
   server that requires one (the server typically returns 401 with no CORS
   headers, which the browser surfaces as a network error).

### Solves timing out before the server finishes (502 / 504 / aborted)

The bottleneck is almost always a proxy in front of Compute, not the library.
Common culprits:

- **Cloudflare** — 100s idle timeout on free/pro plans (525s on enterprise).
- **AWS ALB** — 60s default; raise via the `idle_timeout` attribute.
- **nginx** — 60s default; set `proxy_read_timeout` and `proxy_send_timeout`.

For solves longer than ~2 minutes, prefer running this library **server-side**
and exposing your own job-status endpoint to the browser. Direct
browser → Compute is fine for short solves but fragile for long ones.

### `Definition URL/content is required`

You called `client.solve('', tree)` or passed a `Uint8Array` of length 0.
Validate your input before calling.

### 401 vs 403

- **401 Unauthorized** — `apiKey` (`RhinoComputeKey` header) is missing or
  invalid. Standard Rhino Compute uses this scheme.
- **403 Forbidden** — your `authToken` (Bearer) was rejected by an upstream
  proxy/API gateway. The Compute server itself almost never returns 403.

The error message includes the response body excerpt so you usually get a hint
from the server itself.

### "Superseded by newer solve" errors flooding my console

That's the scheduler doing its job in `latest-wins` mode — every aborted slider
solve rejects with this message. Filter it out:

```ts
scheduler.solve(def, tree).catch((err) => {
	if (/superseded|aborted/i.test(err.message)) return; // expected, not an error
	showError(err);
});
```

### "Failed to load three.js visualization module"

The dynamic import of the visualization layer threw. Make sure `three` is
installed (`npm install three`) — it's a peer dependency, not a direct one.

## Acknowledgement

This library is built on production experience and draws from several official McNeel repositories. Where code has been adapted, it is clearly marked in the relevant files.

**Key References:**

- [compute.rhino3d.appserver](https://github.com/mcneel/compute.rhino3d.appserver) – Server implementation reference
- [IO/Schema.cs](https://github.com/mcneel/compute.rhino3d/blob/8.x/src/compute.geometry/IO/Schema.cs) – Grasshopper API structure
- [GrasshopperDefinition.cs](https://github.com/mcneel/compute.rhino3d/blob/8.x/src/compute.geometry/GrasshopperDefinition.cs) – Definition parsing logic
- [computeclient_js](https://github.com/mcneel/computeclient_js) – JavaScript client implementation

## License

MIT
