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

// 3. Extract and display meshes
const meshes = getMeshesFromDoc(result.rawResponse);
updateScene(scene, meshes, camera, controls);

// 4. Cleanup when done
dispose();
```

---

## API Reference

### Scene Initialization

#### `initThree(canvas, options?)`

Initializes a Three.js scene with camera, renderer, controls, and lighting.

**Parameters:**

- `canvas: HTMLCanvasElement` - The canvas element to render to
- `options?: ThreeInitializerOptions` - Configuration options (see below)

**Returns:**

```typescript
{
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  dispose: () => void;
  resize: () => void;
}
```

**Example:**

```typescript
const { scene, camera, renderer, controls, dispose, resize } = initThree(canvas, {
	sceneScale: 'mm',
	camera: {
		fov: 45,
		position: new THREE.Vector3(100, 100, 100)
	},
	environment: {
		backgroundColor: '#f5f5f5',
		showGrid: true
	}
});
```

### Configuration Options

#### `ThreeInitializerOptions`

```typescript
interface ThreeInitializerOptions {
	// Scene scale - affects camera distance, grid size, etc.
	sceneScale?: 'mm' | 'cm' | 'm';

	camera?: {
		fov?: number; // Field of view (default: 45)
		position?: THREE.Vector3; // Initial camera position
		near?: number; // Near clipping plane
		far?: number; // Far clipping plane
	};

	environment?: {
		backgroundColor?: string | THREE.Color; // Scene background
		showGrid?: boolean; // Show ground grid (default: true)
		showAxes?: boolean; // Show axis helper (default: false)
		gridSize?: number; // Grid size override
	};

	lighting?: {
		ambient?: {
			color?: string | THREE.Color;
			intensity?: number;
		};
		directional?: {
			color?: string | THREE.Color;
			intensity?: number;
			position?: THREE.Vector3;
			castShadow?: boolean;
		};
	};

	floor?: {
		show?: boolean;
		color?: string | THREE.Color;
		size?: number;
		roughness?: number;
		metalness?: number;
		receiveShadow?: boolean;
	};

	controls?: {
		enableDamping?: boolean;
		dampingFactor?: number;
		autoRotate?: boolean;
		autoRotateSpeed?: number;
		enableZoom?: boolean;
		minDistance?: number;
		maxDistance?: number;
	};

	render?: {
		enableShadows?: boolean;
		shadowMapSize?: number;
		antialias?: boolean;
		toneMapping?: THREE.ToneMapping;
		toneMappingExposure?: number;
		pixelRatio?: number;
	};
}
```

---

## Mesh Handling

### `getMeshesFromDoc(computeResponse)`

Extracts Three.js meshes from a Rhino compute response.

**Parameters:**

- `computeResponse: ComputeResponse` - The raw response from a compute job

**Returns:** `THREE.Mesh[]`

**Example:**

```typescript
const result = await client.solve(definitionUrl, tree);
const meshes = getMeshesFromDoc(result.rawResponse);
```

### `updateScene(scene, meshes, camera, controls, autoPosition?)`

Updates the scene with new meshes and optionally repositions the camera.

**Parameters:**

- `scene: THREE.Scene` - The Three.js scene
- `meshes: THREE.Mesh[]` - Array of meshes to add
- `camera: THREE.PerspectiveCamera` - The camera to update
- `controls: OrbitControls` - The orbit controls
- `autoPosition?: boolean` - Auto-position camera (default: true)

**Example:**

```typescript
// Update scene and auto-position camera
updateScene(scene, meshes, camera, controls, true);

// Update without repositioning camera
updateScene(scene, meshes, camera, controls, false);
```

---

## Materials

### Pre-defined Materials

The module exports several pre-configured materials in the `Materials` namespace:

```typescript
import { Materials } from 'rhino-compute-core/threejs';

// Available materials:
Materials.EMISSIVE_MATERIAL; // Glowing white material
Materials.METAL_MATERIAL; // Metallic surface
Materials.GLASS_MATERIAL; // Transparent glass
Materials.DEFAULT_MATERIAL; // Standard material
```

**Example:**

```typescript
import * as Materials from 'rhino-compute-core/threejs';

const mesh = new THREE.Mesh(geometry, Materials.METAL_MATERIAL);
scene.add(mesh);
```

---

## Scale Presets

The scene automatically adjusts settings based on the `sceneScale` option:

| Scale | Use Case                    | Camera Distance | Grid Size | Light Distance |
| ----- | --------------------------- | --------------- | --------- | -------------- |
| `mm`  | Small parts, jewelry        | 200mm           | 1000mm    | 250mm          |
| `cm`  | Product design              | 20cm            | 100cm     | 25cm           |
| `m`   | Architecture, large objects | 20m             | 100m      | 25m            |

---

## Usage Examples

### CAD-like Setup

```typescript
const { scene, camera, controls } = initThree(canvas, {
	sceneScale: 'mm',
	camera: {
		fov: 35, // Narrower FOV for less distortion
		position: new THREE.Vector3(500, 500, 500)
	},
	environment: {
		backgroundColor: '#f5f5f5',
		showGrid: true
	},
	controls: {
		autoRotate: false,
		enableDamping: true,
		dampingFactor: 0.1
	},
	render: {
		enableShadows: false, // Often not needed for CAD
		antialias: true
	}
});
```

### Architectural Visualization

```typescript
const { scene, camera, controls } = initThree(canvas, {
	sceneScale: 'm',
	camera: {
		fov: 60,
		position: new THREE.Vector3(50, 30, 50)
	},
	environment: {
		backgroundColor: '#87CEEB', // Sky blue
		showGrid: true
	},
	floor: {
		show: true,
		color: '#cccccc',
		receiveShadow: true
	},
	lighting: {
		directional: {
			intensity: 1.2,
			castShadow: true
		}
	},
	render: {
		enableShadows: true,
		toneMapping: THREE.ACESFilmicToneMapping,
		toneMappingExposure: 1.0
	}
});
```

### Product Visualization

```typescript
const { scene, camera, controls } = initThree(canvas, {
	sceneScale: 'cm',
	environment: {
		backgroundColor: new THREE.Color(0x1a1a1a)
	},
	floor: {
		show: true,
		color: '#2a2a2a',
		roughness: 0.2,
		metalness: 0.8,
		receiveShadow: true
	},
	lighting: {
		ambient: {
			intensity: 0.4
		},
		directional: {
			intensity: 0.8,
			castShadow: true
		}
	},
	controls: {
		autoRotate: true,
		autoRotateSpeed: 2.0
	}
});
```

---

## Mesh Compression

### `decompressData(compressedData)`

Decompresses mesh data received from Rhino Compute.

**Parameters:**

- `compressedData: string` - Base64 encoded compressed mesh data

**Returns:** `Float32Array` - Decompressed vertex data

This function is used internally by [`getMeshesFromDoc`](src/threejs/three-helpers.ts) but can be
called directly if needed.

---

## Advanced Usage

### Custom Material Application

```typescript
import { getMeshesFromDoc } from 'rhino-compute-core/threejs';
import * as THREE from 'three';

const result = await client.solve(definitionUrl, tree);
const meshes = getMeshesFromDoc(result.rawResponse);

// Apply custom material to specific meshes
meshes.forEach((mesh, index) => {
	if (mesh.name === 'walls') {
		mesh.material = new THREE.MeshPhysicalMaterial({
			color: 0xffffff,
			roughness: 0.8,
			clearcoat: 0.3
		});
	}
});

updateScene(scene, meshes, camera, controls);
```

### Manual Camera Control

```typescript
const { scene, camera, controls } = initThree(canvas);

// Get meshes without auto-positioning
const meshes = getMeshesFromDoc(result.rawResponse);
updateScene(scene, meshes, camera, controls, false);

// Manually position camera
camera.position.set(100, 100, 100);
camera.lookAt(0, 0, 0);
controls.target.set(0, 0, 0);
controls.update();
```

### Window Resize Handling

```typescript
const { resize } = initThree(canvas);

// The resize function is automatically set up, but you can call it manually:
window.addEventListener('resize', resize);

// Or use your own resize handler:
window.addEventListener('resize', () => {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
});
```

### Cleanup

```typescript
const { dispose } = initThree(canvas);

// When you're done with the scene (e.g., component unmount):
dispose();
```

---

## Type Definitions

### `ThreeDisplay`

Rhino display data containing mesh and material information:

```typescript
type ThreeDisplay = {
	id?: number;
	color: string; // Hex color string
	metalness: number; // 0-1
	roughness: number; // 0-1
	opacity: number; // 0-1
	meshData: string; // Compressed mesh data
	name: string; // Mesh name
};
```

---

## Performance Tips

1. **Use appropriate scale**: Choose `sceneScale` that matches your geometry units to avoid
   extremely large or small numbers
2. **Disable shadows**: For CAD applications, disable shadows to improve performance
3. **Adjust pixel ratio**: Limit `pixelRatio` to 2 for high-DPI displays:
   ```typescript
   render: {
   	pixelRatio: Math.min(window.devicePixelRatio, 2);
   }
   ```
4. **Dispose properly**: Always call `dispose()` when cleaning up to prevent memory leaks

---

## Integration with Rhino Compute

Complete workflow example:

```typescript
import { RhinoComputeClient } from 'rhino-compute-core/api';
import { initThree, getMeshesFromDoc, updateScene } from 'rhino-compute-core/threejs';

// Setup
const canvas = document.querySelector('canvas')!;
const { scene, camera, controls, dispose } = initThree(canvas, {
	sceneScale: 'mm'
});

const client = new RhinoComputeClient({
	serverUrl: 'http://localhost:6500'
});

// Compute and visualize
async function runCompute(inputs: Record<string, any>) {
	const result = await client.solveFromUrl('http://example.com/definition.gh', inputs);

	const meshes = getMeshesFromDoc(result.rawResponse);
	updateScene(scene, meshes, camera, controls);
}

// Run with parameters
await runCompute({ width: 100, height: 50, depth: 30 });

// Cleanup
dispose();
```

---

## See Also

- [RhinoComputeClient](../api/client/rhino-compute-client.ts) - High-level compute client
- [Mesh Compression](mesh-compression.ts) - Compression utilities
- [Three.js Documentation](https://threejs.org/docs/) - Official Three.js docs
- [Example Usage](example/example-usage.ts) - More usage examples

---

## License

MIT
