# Grasshopper Feature

This module provides a complete TypeScript interface for working with Grasshopper definitions
through Rhino Compute.

## Quick Start

```typescript
import { GrasshopperClient } from '@rhino-compute/core';

const client = new GrasshopperClient({
	serverUrl: 'https://compute.rhino3d.com',
	apiKey: 'YOUR_API_KEY'
});

// Fetch definition inputs/outputs
const { inputs, outputs } = await client.getIO('https://example.com/definition.gh');

// Solve with values
const result = await client.solve('https://example.com/definition.gh', { radius: 10, height: 20 });

console.log(result.data); // Parsed output data
```

## Core Concepts

### 1. Definition I/O

Every Grasshopper definition has inputs (parameters you can set) and outputs (results it produces).
This library automatically discovers and types these for you.

### 2. Data Trees

Grasshopper uses a hierarchical data structure called "data trees" to organize information. This
library handles conversion between JavaScript arrays/objects and Grasshopper's tree format.

### 3. Type Safety

Raw API responses are transformed into strongly-typed TypeScript interfaces, giving you autocomplete
and compile-time validation.

## Module Structure

```
grasshopper/
├── client/              # High-level GrasshopperClient class
├── solve.ts             # Low-level solve operation
├── io/                  # Input/output handling
│   ├── input/           # Input parsing: normalize-default, input-type-parsers, input-processors
│   └── output/          # Output response processing
├── data-tree/           # Data tree utilities (TreeBuilder)
├── scheduler/           # Solve scheduling (latest-wins / queue / parallel)
├── types.ts             # TypeScript type definitions
└── index.ts             # Public API exports
```

> Generic file zip/base64/download utilities live in [`core/files/`](../../core/files/)
> (not Grasshopper-specific); only `extractFileData` — which reads a Grasshopper
> response — stays here, in `io/output/`.

## Key Features

### Input Processing

- **Type Detection** - Automatically identifies Number, Text, Boolean, Geometry, etc.
- **Validation** - Enforces min/max bounds, required fields
- **Grouping** - Organizes inputs by category for UI generation
- **Defaults** - Handles default values, including data trees

### Output Processing

- **Parsing** - Converts string responses to typed JavaScript objects
- **Data Trees** - Flattens or preserves Grasshopper's tree structure
- **Error Handling** - Captures and reports computation errors/warnings

### Compute Operations

- **Caching** - Optional server-side result caching
- **Timeouts** - Configurable request timeouts
- **Debug Mode** - Detailed logging for troubleshooting

## Usage Examples

### Basic Solve

```typescript
const result = await client.solve('https://example.com/box.gh', { width: 5, height: 10, depth: 3 });

// Access parsed outputs
const boxes = result.data.boxes; // Typed as Brep[]
```

### Working with Data Trees

```typescript
// Single values
const result = await client.solve(definitionUrl, {
	count: 5
});

// Arrays (become {0} branch)
const result = await client.solve(definitionUrl, {
	points: [
		[0, 0, 0],
		[1, 1, 1],
		[2, 2, 2]
	]
});

// Data trees (explicit paths)
const result = await client.solve(definitionUrl, {
	values: {
		'{0}': [1, 2, 3],
		'{1}': [4, 5, 6]
	}
});
```

### Grouped Inputs (for UI generation)

```typescript
const { inputs } = await client.getIO(definitionUrl);

// Group inputs by category
import { groupInputs } from '@rhino-compute/core';
const grouped = groupInputs(inputs, {
	showUngrouped: true,
	capitalize: true
});

// Result:
// {
//   "Geometry": { inputs: [...] },
//   "Settings": { inputs: [...] },
//   "Advanced": { inputs: [...] }
// }
```

### Error Handling

```typescript
try {
	const result = await client.solve(definitionUrl, values);

	if (result.errors?.length) {
		console.error('Computation errors:', result.errors);
	}

	if (result.warnings?.length) {
		console.warn('Computation warnings:', result.warnings);
	}
} catch (error) {
	if (error instanceof RhinoComputeError) {
		console.error('Code:', error.code);
		console.error('Context:', error.context);
	}
}
```

## API Reference

### GrasshopperClient

High-level client for Grasshopper operations.

```typescript
const client = new GrasshopperClient(config);

// Fetch definition metadata
await client.getIO(url);

// Solve with values
await client.solve(url, values);
```

## Advanced Topics

### Custom Input Parsers

See [`io/input/README.md`](io/input/README.md) for how to add support
for new Grasshopper parameter types (the `InputTypeParser` registry).

### Data Tree Manipulation

See [`data-tree/README.md`](data-tree/README.md) for utilities to work with
Grasshopper's data tree structure.

### Response Processing

See [`io/output/response-processors.ts`](io/output/response-processors.ts) for how output parsing
works.

## Configuration Options

```typescript
interface GrasshopperComputeConfig {
	// Required
	serverUrl: string;

	// Optional
	apiKey?: string;
	authToken?: string;
	timeoutMs?: number;
	debug?: boolean;
	suppressBrowserWarning?: boolean;

	// Grasshopper-specific
	cachesolve?: boolean;
	absolutetolerance?: number;
	angletolerance?: number;
	modelunits?: RhinoModelUnit;
}
```

## Related Documentation

- [Input Parsers](io/input/input-parsers/README.md) - Extending input type support
- [Core Types](types.ts) - Complete type definitions
- [Compute Fetch](../../core/compute-fetch/) - Low-level HTTP operations

## Examples

TODO: Create examples

See the `examples/` directory for complete working examples:

- Basic solve operations
- UI generation from definition I/O
- Data tree manipulation
- Error handling patterns
