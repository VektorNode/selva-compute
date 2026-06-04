---
"@selvajs/compute": major
---

Align the Grasshopper client with the Compute8 server contract and overhaul the input/output processing pipeline.

- Update Grasshopper client to align with the Compute8 server contract
- Overhaul the input processing pipeline with type-specific parsers
- Centralize settle-once logic in `SolveScheduler` and unify server URL validation
- Reuse server-definition cache for more efficient solves
- Surface previously-unused Compute server features
- Strengthen hashing for binary definitions to prevent cache collisions
- Improve error handling in `fetchRhinoCompute` and server exception paths

This is a major release containing breaking changes to the client contract.
