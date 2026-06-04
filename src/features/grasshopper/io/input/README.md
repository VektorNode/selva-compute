# Input Parsers

Input parsers transform raw Grasshopper parameter schemas from the Rhino Compute API into
strongly-typed, user-friendly TypeScript interfaces.

## Why Input Parsers?

Grasshopper definitions return parameter metadata with inconsistent types and naming conventions.
Input parsers:

1. **Normalize data structures** - Convert API responses to consistent TypeScript types
2. **Add type safety** - Transform generic `any` types into discriminated unions
3. **Provide defaults** - Handle missing or null values gracefully
4. **Validate constraints** - Ensure numeric bounds, data types, etc.
5. **Simplify consumption** - Give developers a clean, predictable API

## Architecture

```
Raw API Response (PascalCase, inconsistent types)
         ↓
   normalizeDefault (shared: flatten the innerTree default)
         ↓
   INPUT_TYPE_PARSERS registry → the parser for this paramType
         ↓
   parser.parse(schema, base)  (or parser.fallback on bad input)
         ↓
   Strongly-Typed InputParam Union
```

### Core Components

- **`input-processors.ts`** — orchestrator. Builds the common `base` fields,
  canonicalizes the `paramType`, runs the shared `normalizeDefault` step, looks
  up one parser in the registry, and calls `parse` (catching failures →
  `fallback`). It owns **nothing type-specific** — no per-type switch.
- **`normalize-default.ts`** — the shared, type-independent step that flattens a
  raw Grasshopper `innerTree` default into the scalar/array/tree shape parsers
  expect. Runs before type dispatch. Pure.
- **`input-type-parsers.ts`** — the **input-type parser** seam: one
  `InputTypeParser` adapter per param type, plus the `INPUT_TYPE_PARSERS`
  registry. Each parser owns its coercion, type-specific fields, typed-param
  construction, and its own safe `fallback`.
- **Discriminated union** — `InputParam` ties the parsers' outputs together for
  type safety.

## Parameter Types

Each parser declares the canonical `paramType`(s) it owns via its `types` field
and is registered in `INPUT_TYPE_PARSERS`:

| Parser            | `types`             | Output Type          |
| ----------------- | ------------------- | -------------------- |
| `numericParser`   | `Number`, `Integer` | `NumericInputType`   |
| `textParser`      | `Text`              | `TextInputType`      |
| `booleanParser`   | `Boolean`           | `BooleanInputType`   |
| `valueListParser` | `ValueList`         | `ValueListInputType` |
| `geometryParser`  | `Geometry`          | `GeometryInputType`  |
| `fileParser`      | `File`              | `FileInputType`      |
| `colorParser`     | `Color`             | `ColorInputType`     |

## How It Works

### 1. The orchestrator dispatches through the registry

```typescript
// input-processors.ts (simplified)
const paramType = canonicalizeParamType(rawInput.paramType);
const schema = normalizeDefault({ ...rawInput, paramType });
const parser = INPUT_TYPE_PARSERS.get(paramType);

try {
	if (!parser) throw RhinoComputeError.unknownParamType(paramType, rawInput.name);
	return { input: parser.parse(schema, base) };
} catch (error) {
	// recoverable failure → the parser's own fallback + an error report
	return { input: (parser ?? UNKNOWN_TYPE_FALLBACK).fallback(schema, base), error: {...} };
}
```

### 2. Each parser is one adapter implementing `InputTypeParser`

```typescript
// input-type-parsers.ts — every param type's knowledge lives in one place
const numericParser: InputTypeParser<NumericInputType> = {
	types: ['Number', 'Integer'],
	parse(schema, base) {
		const { default: def, stepSize } = computeNumeric(schema);
		return {
			...base,
			paramType: schema.paramType as 'Number' | 'Integer',
			minimum: schema.minimum,
			maximum: schema.maximum,
			atLeast: schema.atLeast,
			atMost: schema.atMost,
			stepSize,
			default: def
		};
	},
	fallback(schema, base) {
		const isList = (schema.atMost ?? 1) > 1;
		return {
			...base,
			paramType: schema.paramType as 'Number' | 'Integer',
			minimum: schema.minimum,
			maximum: schema.maximum,
			atLeast: schema.atLeast,
			atMost: schema.atMost,
			default: isList ? [0] : 0
		};
	}
};
```

### 3. Output is Type-Safe

```typescript
const inputs = processInputs(rawApiResponse);

inputs.forEach((input) => {
	if (input.paramType === 'Number') {
		// TypeScript knows input has minimum, maximum, etc.
		console.log(input.minimum, input.maximum);
	}
});
```

## Adding a New Parser

Supporting a new Grasshopper parameter type is one new adapter plus a registry
entry — no edits to `input-processors.ts`.

### 1. Define the Type Interface and add it to the union

```typescript
// filepath: src/features/grasshopper/types.ts
export interface CustomInputType extends BaseInputType {
	paramType: 'Custom';
	customProperty: string;
	default: DefaultValue<CustomType>;
}

export type InputParam =
	| NumericInputType
	| TextInputType
	| CustomInputType // ← add here
	| ...;
```

### 2. Write the parser adapter

A parser implements `InputTypeParser`: it declares the canonical `types` it
owns, a `parse` (happy path — throws a `RhinoComputeError` on recoverable bad
input), and a `fallback` (this type's safe default when `parse` throws). It
reads from an already-`normalizeDefault`'d schema and is **pure** — it returns a
typed param and never mutates the schema.

```typescript
// filepath: src/features/grasshopper/io/input/input-type-parsers.ts
const customParser: InputTypeParser<CustomInputType> = {
	types: ['Custom'],
	parse(schema, base) {
		const value = coerceDefault(schema.default, customTransformer, true);
		return {
			...base,
			paramType: 'Custom',
			customProperty: schema.customProperty ?? 'default',
			default: value as CustomInputType['default']
		};
	},
	fallback(schema, base) {
		const isList = (schema.atMost ?? 1) > 1;
		return {
			...base,
			paramType: 'Custom',
			customProperty: 'default',
			default: isList ? [null] : null
		};
	}
};
```

If the default needs flattening that differs by `treeAccess` / `atMost`, that
belongs in the shared `normalize-default.ts`, not here — parsers receive an
already-flattened default.

### 3. Register it

Add the parser to `ALL_PARSERS` in `input-type-parsers.ts`. The registry and
the case-insensitive canonicalization pick it up automatically from its `types`:

```typescript
const ALL_PARSERS: InputTypeParser[] = [
	numericParser,
	// ...
	customParser // ← add here
];
```

## Testing Your Parser

Test the parser directly through its `parse` interface — the typed param it
returns is the test surface:

```typescript
import { INPUT_TYPE_PARSERS } from '@/features/grasshopper/io/input/input-type-parsers';
import { createInputSchema } from '@tests/helpers/test-data-builders';

const base = { description: '', name: 'test', nickname: 'T', treeAccess: false, groupName: '' };

describe('customParser', () => {
	it('parses a custom parameter', () => {
		const schema = createInputSchema({ paramType: 'Custom', customProperty: 'value' } as any);
		const result = INPUT_TYPE_PARSERS.get('Custom')!.parse(schema, base) as any;
		expect(result.paramType).toBe('Custom');
		expect(result.customProperty).toBe('value');
	});
});
```

Also add a case to `process-inputs.characterization.test.ts` so the end-to-end
pipeline behavior (including your fallback on bad input) is pinned.

## Best Practices

1. **Keep parsers pure** — read from the schema, return a typed param, never mutate.
2. **Own your fallback** — `fallback` is where this type's safe default lives; don't push it into the orchestrator.
3. **Throw `RhinoComputeError` for recoverable bad input** — the registry pairs it with your fallback.
4. **Leave tree-flattening to `normalizeDefault`** — it's shared and type-independent.
5. **Handle null/undefined gracefully** — API responses may have missing fields.

## Example: Complete Flow

```typescript
// 1. API returns raw data
const apiResponse = {
	paramType: 'Number',
	name: 'radius',
	minimum: 0,
	maximum: 100,
	default: 10
	// ... other fields
};

// 2. Processor routes to numeric parser
const processed = processInputs([apiResponse]);

// 3. Result is strongly typed
const input = processed[0];
if (input.paramType === 'Number') {
	console.log(input.minimum); // TypeScript knows this exists
	console.log(input.default); // Type: number | number[] | DataTreeDefault<number>
}
```
