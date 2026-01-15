# Core Module

Foundational utilities and low-level clients that power the `selva-compute` library. This module handles the "plumbing" of communicating with Rhino Compute.

## Key Responsibilities

- **Compute Communication**: Type-safe HTTP wrappers for the Rhino Compute API.
- **Error Handling**: Specialized `RhinoComputeError` classes for precise debugging of API and network failures.
- **Server Monitoring**: Utilities to fetch runtime stats and telemetry from Compute instances.
- **Data Processing**: Utilities for base64 encoding/decoding and camelCase normalization of API responses.

## Structure

```text
src/core/
├── compute-fetch/    # Low-level HTTP client logic
├── errors/           # Custom error types and factory
├── server/           # Server health and stats monitoring
├── utils/            # Encoding, logging, and string utilities
└── types.ts          # Core shared configuration types
```

## Usage

The `core` module provides the building blocks for the rest of the library. Below are the two most common ways to use it.

### 1. Low-level API Requests

Use `fetchRhinoCompute` for type-safe requests to arbitrary Rhino Compute endpoints.

```typescript
import { fetchRhinoCompute, RhinoComputeError } from 'selva-compute/core';

async function performCustomJob(config) {
	try {
		const response = await fetchRhinoCompute(
			'rhino/geometry/point/at',
			{ x: 1, y: 0, z: 0 },
			config
		);
		return response;
	} catch (error) {
		if (error instanceof RhinoComputeError) {
			// Handle specific error codes (e.g. AUTH_ERROR, COMPUTATION_ERROR)
			console.error(`Status ${error.status}: ${error.message}`);
		}
	}
}
```

### 2. Server Monitoring

Use `ComputeServerStats` to check server health, get the version, or monitor active child processes.

```typescript
import { ComputeServerStats } from 'selva-compute/core';

async function checkServer(url, apiKey) {
	const stats = new ComputeServerStats(url, apiKey);

	try {
		if (await stats.isServerOnline()) {
			const info = await stats.getServerStats();
			console.log(`Server Version: ${info.version}`);
			console.log(`Active Children: ${info.activeChildren.length}`);
		}
	} finally {
		await stats.dispose(); // Always dispose to clear monitoring timeouts
	}
}
```

> **Note:** Higher-level features like the `GrasshopperClient` use these modules internally. Direct use is recommended for custom low-level API calls or dedicated monitoring services.
