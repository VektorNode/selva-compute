# DataTree Utilities

Utilities for working with Grasshopper's hierarchical data tree structure.

## Overview

Grasshopper uses a tree structure to organize data with branch paths like `{0}`, `{0;1}`, `{1;2;3}`. This module provides the `DataTree` class to create, manipulate, and convert data trees for use with Rhino Compute.

## The DataTree Class

The `DataTree` class is a standalone, fluent API for building Grasshopper data trees without depending on the RhinoCompute library.

### Basic Usage

```typescript
import { DataTree } from '@rhino-compute/core';

// Create a simple flat tree
const tree = new DataTree('MyParameter').appendFlat([1, 2, 3, 4, 5]).toComputeFormat();

// Create a multi-branch tree
const complexTree = new DataTree('Points')
	.append([0], [{ x: 0, y: 0, z: 0 }])
	.append([0, 1], [{ x: 1, y: 1, z: 1 }])
	.append([1], [{ x: 2, y: 2, z: 2 }])
	.toComputeFormat();
```

### Creating from InputParams

The most common use case is converting `InputParam` arrays to DataTree format:

```typescript
import { DataTree } from '@rhino-compute/core';

// Get inputs from a definition
const { inputs } = await client.getIO('https://example.com/definition.gh');

// Convert all inputs to DataTrees
const trees = DataTree.fromInputParams(inputs);

// Send to compute
const result = await client.solve(definitionUrl, trees);
```

### Working with Tree Structures

```typescript
// From a DataTreeDefault structure
const tree = new DataTree('Values').fromDataTreeDefault({
	'{0}': [1, 2, 3],
	'{0;0}': [4, 5],
	'{1}': [6, 7, 8]
});

// Get all branch paths
const paths = tree.getPaths(); // ['{0}', '{0;0}', '{1}']

// Get values at a specific path
const values = tree.getValuesAt([0, 0]); // [4, 5]

// Flatten all values
const allValues = tree.flatten(); // [1, 2, 3, 4, 5, 6, 7, 8]
```

### Path Utilities

```typescript
// Parse path strings
const path = DataTree.parsePathString('{0;1;2}'); // [0, 1, 2]

// Format path arrays
const pathStr = DataTree.formatPathString([0, 1, 2]); // '{0;1;2}'
```

### Numeric Constraints

The DataTree class automatically applies numeric constraints from `InputParam` definitions:

```typescript
const inputs: InputParam[] = [
	{
		name: 'radius',
		paramType: 'Number',
		minimum: 0,
		maximum: 100,
		default: 150 // Will be clamped to 100
		// ... other properties
	}
];

// Constraints are automatically applied
const trees = DataTree.fromInputParams(inputs);
// Result: radius value will be clamped to 100
```

## Best Practices

1. **Use `DataTree.fromInputParams()` for standard conversions** - It handles all the complexity of tree access, numeric constraints, and value formatting.

2. **Use the fluent API for custom trees** - When you need to build trees programmatically, the `DataTree` class provides a clean, chainable interface.

3. **Call `toComputeFormat()` when sending to server** - This ensures compatibility with the Rhino Compute API.

4. **Leverage type safety** - The `DataTreeDefault<T>` type helps catch errors at compile time.

## Advanced Example

```typescript
import { DataTree, GrasshopperClient } from '@rhino-compute/core';

const client = new GrasshopperClient({ serverUrl: 'http://localhost:8081' });

// Get definition I/O
const { inputs } = await client.getIO('definition.gh');

// Modify specific input values
const modifiedInputs = inputs.map((input) => {
	if (input.name === 'radius') {
		return { ...input, default: 25 };
	}
	if (input.name === 'height') {
		return { ...input, default: 50 };
	}
	return input;
});

// Convert to trees
const trees = DataTree.fromInputParams(modifiedInputs);

// Solve
const result = await client.solve('definition.gh', trees);
```

## Migration Guide

If you're using the old helper functions, here's how to migrate:

| Old Code                                | New Code                                                 |
| --------------------------------------- | -------------------------------------------------------- |
| `inputsToDataTrees(inputs)`             | `DataTree.fromInputParams(inputs)`                       |
| `buildDataTree(name, value)`            | `new DataTree(name).appendFlat(value).toComputeFormat()` |
| `new RhinoCompute.Grasshopper.DataTree` | `new DataTree(name)`                                     |

## Breaking Changes

**All legacy helper functions have been removed:**

- ❌ `inputsToDataTrees()` → ✅ Use `DataTree.fromInputParams()`
- ❌ `groupedInputsToDataTrees()` → ✅ Use `DataTree.fromInputParams()` with flattened inputs
- ❌ `buildDataTree()` → ✅ Use `new DataTree(name).appendFlat(value).toComputeFormat()`
- ❌ `replaceTreeValue()` → ✅ Build new tree or update directly
- ❌ `isDataTreeStructure()` → ✅ Use DataTree static methods

The new `DataTree` class is:

- Standalone (no RhinoCompute dependency)
- Type-safe with full TypeScript support
- More flexible with additional utility methods
- Easier to test and mock
