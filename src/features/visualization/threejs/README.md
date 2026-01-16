# Three.js Integration for Rhino Compute

This module provides utilities for visualizing Rhino geometry in Three.js. It includes scene
initialization, mesh handling, material definitions, and compression utilities optimized for
CAD/computational design workflows.

---

## Features

- **Scene Initialization**: Pre-configured Three.js scene setup with scale-aware defaults for mm,
  cm, and m units
- **Mesh Handling**: Convert Rhino compute responses to Three.js meshes with automatic decompression
- **Material Library**: Pre-defined materials optimized for architectural and product visualization
- **Mesh Compression**: Efficient data compression for transferring geometry over the network
- **Camera & Controls**: Automatic camera positioning based on geometry bounding boxes
- **Responsive**: Built-in window resize handling and cleanup utilities

---

## Installation

This module is part of `rhino-compute-core`. Import from the `threejs` subpath:

```typescript
import { initThree, updateScene, getMeshesFromDoc } from 'rhino-compute-core/threejs';
```

---

## Quick Start

### Basic Setup

```typescript
import { initThree, updateScene } from 'rhino-compute-core/threejs';
import { RhinoComputeClient } from 'rhino-compute-core/api';

// 1. Initialize Three.js scene
const canvas = document.querySelector('canvas');
const { scene, camera, controls, dispose } = initThree(canvas);

// 2. Run compute job
const client = new RhinoComputeClient({ serverUrl: 'http://localhost:6500' });
const result = await client.solveFromUrl(definitionUrl, { width: 100, height: 50 });

// 3. Extract and display meshes (works only in combination with selva plugin and custom branch of rhino.compute)
const meshes = getMeshesFromDoc(result.rawResponse);
updateScene(scene, meshes, camera, controls);

// 4. Cleanup when done
dispose();
```
