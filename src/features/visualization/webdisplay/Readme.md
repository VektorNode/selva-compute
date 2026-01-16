## Web Display Requirements & Workflow

To use the web display features, you must:

- Use the **Selva Display** component in Grasshopper to prepare mesh data for export.
- Plug the resulting mesh data into a **Context Bake** component.
- Run your definition on the **custom branch of rhino.compute** from VektorNode.

The custom compute server will include the correct mesh data structure in the compute response, enabling seamless integration with the web display logic.
