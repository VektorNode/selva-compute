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
   Input Processors (normalize & route)
         ↓
   Type-Specific Parsers (transform & validate)
         ↓
   Strongly-Typed InputParam Union
```

### Core Components

- **`input-processors.ts`** - Main entry point that routes raw schemas to appropriate parsers
- **Type-specific parsers** - Handle individual parameter types (numeric, text, boolean, etc.)
- **Discriminated union** - `InputParam` type ensures type safety across all parsers

## Parameter Types

| Parser              | Handles                 | Output Type                                            |
| ------------------- | ----------------------- | ------------------------------------------------------ |
| `numeric-parser.ts` | Numbers & Integers      | `NumericInputType`                                     |
| `text-parser.ts`    | Strings                 | `TextInputType`                                        |
| `boolean-parser.ts` | True/False values       | `BooleanInputType`                                     |
| `object-parser.ts`  | Geometry, Points, Lines | `GeometryInputType`, `PointInputType`, `LineInputType` |

## How It Works

### 1. Input Processor Routes by Type

```typescript
export function processInputs(rawInputs: InputParamSchema[]): InputParam[] {
	return rawInputs.map((input) => {
		switch (input.paramType.toLowerCase()) {
			case 'number':
			case 'integer':
				return parseNumericInput(input);
			case 'text':
				return parseTextInput(input);
			case 'boolean':
				return parseBooleanInput(input);
			// ... etc
		}
	});
}
```

### 2. Each Parser Transforms Its Type

```typescript
// Example: numeric-parser.ts
export function parseNumericInput(raw: InputParamSchemaRaw): NumericInputType {
	return {
		paramType: raw.paramType === 'Integer' ? 'Integer' : 'Number',
		name: raw.name,
		nickname: raw.nickname,
		description: raw.description,
		treeAccess: raw.treeAccess,
		groupName: raw.groupName || 'Default',
		minimum: raw.minimum,
		maximum: raw.maximum,
		atLeast: raw.atLeast,
		atMost: raw.atMost,
		stepSize: raw.stepSize,
		default: parseDefaultValue(raw.default)
	};
}
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

To support a new Grasshopper parameter type:

### 1. Define the Type Interface

```typescript
// filepath: src/features/grasshopper/types.ts
export interface CustomInputType extends BaseInputType {
	paramType: 'Custom';
	customProperty: string;
	default: DefaultValue<CustomType>;
}
```

### 2. Add to InputParam Union

```typescript
// filepath: src/features/grasshopper/types.ts
export type InputParam =
  | NumericInputType
  | TextInputType
  | BooleanInputType
  | CustomInputType // Add here
  | ...
```

### 3. Create Parser Function

```typescript
// filepath: src/features/grasshopper/io/input/input-parsers/custom-parser.ts
import type { InputParamSchema, CustomInputType } from '../../../types';

/**
 * Parses custom parameter inputs
 * @param raw - Raw input schema from API
 * @returns Processed custom input type
 */
export function parseCustomInput(raw: InputParamSchema): CustomInputType {
	return {
		paramType: 'Custom',
		name: raw.name,
		nickname: raw.nickname,
		description: raw.description,
		treeAccess: raw.treeAccess,
		groupName: raw.groupName || 'Default',
		customProperty: raw.customProperty || 'default',
		default: parseCustomDefault(raw.default)
	};
}

function parseCustomDefault(value: any): DefaultValue<CustomType> {
	// Transform raw default value to CustomType
	if (!value) return undefined;
	// ... parsing logic
	return value;
}
```

### 4. Register in Input Processor

```typescript
// filepath: src/features/grasshopper/io/input/input-parsers/input-processors.ts
import { parseCustomInput } from './custom-parser';

export function processInputs(rawInputs: InputParamSchema[]): InputParam[] {
	return rawInputs.map((input) => {
		switch (input.paramType.toLowerCase()) {
			case 'custom':
				return parseCustomInput(input);
			// ...existing cases...
			default:
				throw new Error(`Unsupported parameter type: ${input.paramType}`);
		}
	});
}
```

### 5. Export from Index

```typescript
// filepath: src/features/grasshopper/io/input/input-parsers/index.ts
export { parseCustomInput } from './custom-parser';
```

## Testing Your Parser

```typescript
// tests/grasshopper/io/custom-parser.test.ts
import { parseCustomInput } from '@/features/grasshopper/io/input/input-parsers';

describe('parseCustomInput', () => {
	it('should parse custom parameter correctly', () => {
		const raw = {
			paramType: 'Custom',
			name: 'testParam',
			nickname: 'TP',
			description: 'Test parameter',
			treeAccess: false,
			groupName: 'TestGroup',
			customProperty: 'value',
			default: {
				/* ... */
			}
		};

		const result = parseCustomInput(raw);

		expect(result.paramType).toBe('Custom');
		expect(result.customProperty).toBe('value');
		// ... more assertions
	});
});
```

## Best Practices

1. **Handle null/undefined gracefully** - API responses may have missing fields
2. **Provide sensible defaults** - Don't force users to specify everything
3. **Validate constraints** - Throw meaningful errors for invalid data
4. **Document edge cases** - Comment unusual transformations
5. **Keep parsers pure** - No side effects, easy to test
6. **Use type guards** - Leverage TypeScript's discriminated unions

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
