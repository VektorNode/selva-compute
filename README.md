<!-- Badges -->
<div align="center">

[![npm version](https://img.shields.io/npm/v/selva-compute.svg)](https://www.npmjs.com/package/selva-compute)
[![npm downloads](https://img.shields.io/npm/dm/selva-compute.svg)](https://www.npmjs.com/package/selva-compute)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![GitHub Repository](https://img.shields.io/badge/GitHub-VektorNode/selva--compute-blue?logo=github)](https://github.com/VektorNode/selva-compute)

</div>

# selva-compute

An intermediate-level TypeScript framework for building web applications with Rhino Compute and Grasshopper.

`selva-compute` simplifies the process of communicating with Rhino Compute, handling Grasshopper definitions, and visualizing results in the browser with Three.js.

## Installation

```bash
npm install selva-compute three
```

_(Note: `three` is a peer dependency if you use the visualization features)_

## Why this project exists

`selva-compute` provides a type-safe, production-ready foundation for building with Rhino Compute:

- **Type-safe API** – Full TypeScript support with advanced error handling for stability
- **High-level abstractions** – Use `GrasshopperClient` and `GrasshopperResponseProcessor` to get started quickly
- **Ready-to-use visualization** – Integrated Three.js setup with `initScene()` and configurable rendering options

Whether you're building a simple solver or a complex web application, `selva-compute` handles the complexity so you can focus on your Grasshopper definitions.

> **Note:** The library currently focuses on the Grasshopper endpoint but is designed to support other Rhino Compute endpoints in future releases.

### Example with GrasshopperClient

```ts
// Configuration
const DEFINITION_FILE = 'my-definition.gh';
const COMPUTE_SERVER = 'http://localhost:6500';
const API_KEY = 'your-api-key';

const config = {
	serverUrl: COMPUTE_SERVER,
	apiKey: API_KEY
} as GrasshopperComputeConfig;

let client: GrasshopperClient | null = null;

// Step 1: Create and initialize the client
client = await GrasshopperClient.create(config);

// Step 2: Get definition inputs and outputs
const io = await client.getIO(DEFINITION_FILE);

// Step 3: Build input data tree from definition parameters
const inputTree = TreeBuilder.fromInputParams(io.inputs);

// Step 4: Run the computation
const result = await client.solve(DEFINITION_FILE, inputTree);

// Step 5: Process and display results
const processor = new GrasshopperResponseProcessor(result);
const { values } = processor.getValues();
```

## Requirements

### Core Requirements

- **Node.js** >= 20
- **three** >= 0.179.0 (required for visualization features)

### Rhino Compute Compatibility

`selva-compute` works with both standard Rhino Compute and enhanced versions:

**Standard Rhino Compute** – The [official McNeel repository](https://github.com/mcneel/compute.rhino3d) works for basic Grasshopper solving with core features.

**Enhanced Setup** (Recommended) – Unlock advanced features:

1. **Selva Rhino Plugin** – Grasshopper plugin that simplifies building Three.js visualizations and exporting results directly from Grasshopper. [Download from Food4Rhino](https://www.food4rhino.com/en/app/selva?lang=en). Detailed documentation will be available when the Selva project is open-sourced.
2. **Custom Compute Server** – Our [custom branch](https://github.com/VektorNode/compute.rhino3d) enables:
   - **Input Grouping** – Organize inputs with the `groupName` property
   - **Persistent IDs** – Uniquely identify inputs across definition changes using Grasshopper object GUIDs

> Features requiring the enhanced setup will be clearly marked in the documentation.

## Acknowledgement

This library is built on production experience and draws from several official McNeel repositories. Where code has been adapted, it is clearly marked in the relevant files.

**Key References:**

- [compute.rhino3d.appserver](https://github.com/mcneel/compute.rhino3d.appserver) – Server implementation reference
- [IO/Schema.cs](https://github.com/mcneel/compute.rhino3d/blob/8.x/src/compute.geometry/IO/Schema.cs) – Grasshopper API structure
- [GrasshopperDefinition.cs](https://github.com/mcneel/compute.rhino3d/blob/8.x/src/compute.geometry/GrasshopperDefinition.cs) – Definition parsing logic
- [computeclient_js](https://github.com/mcneel/computeclient_js) – JavaScript client implementation

## License

MIT
