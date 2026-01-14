% rhino-compute-core — Core utilities and clients

This folder contains the core building blocks used throughout the package. It provides small,
well-typed utilities, client helpers for talking to a Rhino Compute server, error types, and other
shared code that higher-level features rely on.

When working inside the package the `core` module is the primary place to look for:

- network and fetch helpers that call the Compute server
- typed error classes and helpers used across the project
- binary/encoding helpers for handling base64 and binary payloads
- small data validation and key-normalization utilities

## Layout

```
src/core
├─ client/                # client helpers and telemetry
│  ├─ compute-server-stats.ts
│  └─ index.ts
├─ compute-fetch/         # safe wrappers around fetch/compute requests
│  ├─ compute-fetch.ts
│  └─ index.ts
├─ errors/                # typed error classes and helpers
│  ├─ auth.ts
│  ├─ base.ts
│  ├─ compute-errors.ts
│  ├─ network.ts
│  └─ validation.ts
├─ utils/                 # small reusable utilities
│  ├─ camel-case.ts
│  ├─ encoding.ts
│  ├─ validation.ts
│  └─ warnings.ts
├─ types.ts               # core shared TypeScript types
└─ README.md              # this file
```

## Key APIs

- `compute-fetch/compute-fetch.ts` — a safe, typed wrapper for performing requests to the Rhino
  Compute server. Handles JSON parsing, status checks and converts responses into the project's
  typed shapes.

- `client/compute-server-stats.ts` — lightweight helpers to request and normalise runtime/telemetry
  information from a Compute server.

- `errors/*` — a set of Error subclasses (for auth, network, validation and compute-specific
  failures) that make it easy to inspect and react to specific failure modes.

- `utils/encoding.ts` — base64 and binary helpers used when responses contain file data or binary
  blobs. The utilities are written to work in both browser and Node environments.

- `utils/camel-case.ts` — converts API response keys to camelCase to make consuming data predictable
  in JavaScript/TypeScript.

## Usage

Import what you need from the package entrypoints. Example (consumer-facing):

```ts
import { fetchFromCompute } from 'rhino-compute-core/core/compute-fetch';
import { ValidationError } from 'rhino-compute-core/core/errors';

async function fetchModel() {
	try {
		const data = await fetchFromCompute('/rhino/compute/some-endpoint');
		// process data...
	} catch (e) {
		if (e instanceof ValidationError) {
			// handle validation problems specifically
		}
		throw e;
	}
}
```

Note: public package entry points re-export many of these symbols. Prefer importing from the package
root (`rhino-compute-core`) where possible so the bundler/exports map can apply optimisations.
