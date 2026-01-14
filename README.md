# selva-compute

A high-level TypeScript framework for building web applications with Rhino Compute and Grasshopper.

`selva-compute` simplifies the process of communicating with Rhino Compute, handling Grasshopper definitions, and visualizing results in the browser with Three.js.

## Installation

```bash
npm install selva-compute three
```

_(Note: `three` is a peer dependency if you use the visualization features)_

## Quick Start

### 1. Initialize the Client

```typescript
import { RhinoComputeApp } from 'selva-compute';

const app = new RhinoComputeApp({
	url: 'http://localhost:6500/', // URL of your Rhino Compute instance
	apiKey: 'your-auth-token', // Optional
	debug: true // Enable logging
});
```

### 2. Solve a Grasshopper Definition

```typescript
// Define your inputs
const inputs = {
	Length: 12.5,
	Width: 5.0,
	Count: 10
};

// Solve the definition
try {
	const result = await app.solve('my_definition.gh', inputs);

	// Access outputs
	console.log('Results:', result.values);
	console.log('Geometry:', result.geometry); // Decoded rhino3dm objects
} catch (error) {
	console.error('Computation failed:', error);
}
```

## Features

- **Robust Client**: Handles connection, retries, and error parsing.
- **Smart Solving**: Automatically formats inputs and parses output trees.
- **Visualization Tools**: Convert Rhino geometry to Three.js objects easily.
  ```typescript
  import { toThreeJs } from 'selva-compute/visualization';
  const mesh = toThreeJs(rhinoMesh);
  scene.add(mesh);
  ```
- **File Utils**: Helpers for handling base64 encoding/decoding of Rhino files.

## Exports

- `selva-compute` - Main entry point (Client, App).
- `selva-compute/grasshopper` - Grasshopper client and types.
- `selva-compute/visualization` - Three.js conversion helpers.
- `selva-compute/files` - File utilities.

## Requirements

### Server Side

`selva-compute` is compatible with standard Rhino Compute, but to unlock its full potential, we recommend:

1. **Selva Rhino Plugin** (Recommended): Adds support for advanced display modes and optimized serialization. [Download from Food4Rhino](https://www.food4rhino.com/en/app/selva?lang=en).
2. **Custom Compute Server** (Optional): Standard Rhino Compute works for basic solving. However, our **[custom branch](https://github.com/VektorNode/compute.rhino3d)** is required if you want to use:
   - **Input Grouping**: Support for the `groupName` property in parameters.
   - **Persistent IDs**: Support for the `id` property to uniquely identify inputs across definition changes.

### Client Side

- Node.js >= 20
- Optional: `three` >= 0.160.0 for visualization features

## License

MIT
