# selva-compute

A high-level TypeScript framework for building web applications with Rhino Compute and Grasshopper.

`selva-compute` simplifies the process of communicating with Rhino Compute, handling Grasshopper definitions, and visualizing results in the browser with Three.js.

## Installation

```bash
npm install selva-compute three
```

_(Note: `three` is a peer dependency if you use the visualization features)_

## Requirements

### Server Side

`selva-compute` is compatible with standard Rhino Compute, but to unlock its full potential, we recommend:

1. **Selva Rhino Plugin** (Recommended): Adds support for advanced display modes and optimized serialization. [Download from Food4Rhino](https://www.food4rhino.com/en/app/selva?lang=en).
2. **Custom Compute Server** (Optional): Standard Rhino Compute works for basic solving. However, our **[custom branch](https://github.com/VektorNode/compute.rhino3d)** is required if you want to use:
   - **Input Grouping**: Support for the `groupName` property in parameters.
   - **Persistent IDs**: Support for the `id` property to uniquely identify inputs across definition changes.

### Client Side

- Node.js >= 20
- Optional: `three` >= 0.179.0 for visualization features

## License

MIT
