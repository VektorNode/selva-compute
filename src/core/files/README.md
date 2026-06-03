## File Handling Requirements & Workflow

This feature depends on:

- The **Selva plugin** for Grasshopper
- The **custom branch of rhino.compute** from VektorNode ([see implementation reference](https://github.com/VektorNode/compute.rhino3d/blob/1fc5e2c78928cddca249c0d61a7db42fd778bafc/src/compute.geometry/GrasshopperDefinition.cs#L1161))

### How File Export Works

1. In Grasshopper, use the components **Block to File** and **Geometry To File** to generate files.
2. Plug these components into a **Context Bake** component.
3. The custom VektorNode rhino.compute server will properly process and return the files in the compute response.

> **Note:** Standard rhino.compute does not support this workflow. The custom branch is required for file export integration.
