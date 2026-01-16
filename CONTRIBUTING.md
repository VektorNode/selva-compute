# Contributing to selva-compute

## Export Rules (Keep It Simple)

### ✅ DO

- **Be explicit**: Always list what you export by name

  ```typescript
  export { MyFunction } from './module';
  ```

- **Use section comments**: Organize exports with clear headers

  ```typescript
  // ============================================================================
  // PUBLIC API
  // ============================================================================
  export { GrasshopperClient } from './client';
  ```

- **Separate types from values**: Use `export type` for types

  ```typescript
  export { solveGrasshopper } from './solve';
  export type { Result } from './types';
  ```

- **Delete unnecessary files**: Remove intermediate index.ts files that just re-export one thing
  ```
  ❌ src/compute-fetch/index.ts  (just exports ./compute-fetch)
  ✅ Import directly: './compute-fetch/compute-fetch'
  ```

### ❌ DON'T

- **Never use `export *`** unless aggregating multiple submodules into a feature

  ```typescript
  // BAD - no one knows what's exported
  export * from './errors';

  // GOOD - clear what's public
  export { RhinoComputeError } from './base';
  export { ErrorCodes } from './error-codes';
  ```

- **Don't create wrapper index.ts files** that only re-export one thing
  - Removes a layer of indirection
  - Makes imports more direct and clearer

- **Don't mix explicit and wildcard exports** in the same file

  ```typescript
  // BAD - inconsistent
  export { initThree } from './initializer';
  export * from './helpers';

  // GOOD - all explicit
  export { initThree } from './initializer';
  export { updateScene, parseColor } from './helpers';
  ```

## Quick Checklist

When adding/modifying exports:

- [ ] All exports are explicitly named
- [ ] File has a JSDoc header explaining its purpose
- [ ] Types are marked with `export type`
- [ ] No `export *` unless it's a feature aggregator
- [ ] No unnecessary index.ts wrappers
- [ ] Imports in other files use direct paths, not aggregators

## Error Handling

Use `RhinoComputeError` with static helper methods:

```typescript
// Generic validation error
throw RhinoComputeError.validation('inputName', 'reason');

// Specific cases
throw RhinoComputeError.missingValues('inputName', 'Type');
throw RhinoComputeError.invalidDefault('inputName', defaultValue, availableValues);
throw RhinoComputeError.unknownParamType(paramType, paramName);
throw RhinoComputeError.invalidStructure('inputName', 'expected structure');
```

Include proper error codes—never pass `undefined`.

## Feature Dependencies

If a feature requires Selva plugin components or custom compute, document it:

```typescript
/**
 * Extract meshes from geometry results.
 *
 * **Requires:** Selva Display component in Grasshopper + custom VektorNode compute branch.
 *
 * @throws {RhinoComputeError} If three.js is not installed
 */
public async extractMeshesFromResponse(options?: MeshExtractionOptions) { }
```

Use `@note` for optional enhancements, standard docstring for requirements.

## Commits & Changesets

- **Commit messages:** Use conventional format (`chore:`, `feat:`, `fix:`, `docs:`)
- **Changesets:** Create one per significant change in `.changeset/` directory
  ```markdown
  ---
  'selva-compute': patch
  ---

  Brief description of changes
  ```
