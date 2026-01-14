import type { InputParamSchema } from '@/features/grasshopper/types';

// ============================================================================
// INPUT PARAMETER SCHEMA BUILDERS (Most commonly used)
// ============================================================================

/**
 * Base builder for InputParamSchema with sensible defaults
 * Eliminates repetition of creating 8-line objects in tests
 *
 * @example
 * ```typescript
 * // Instead of:
 * const input: InputParamSchema = {
 *   name: 'test',
 *   nickname: 'T',
 *   description: '',
 *   paramType: 'Number',
 *   default: 42,
 *   treeAccess: false,
 *   groupName: null,
 *   minimum: null,
 *   maximum: null,
 *   atLeast: 1,
 *   atMost: 1,
 * };
 *
 * // Use:
 * const input = createInputSchema({ paramType: 'Number', default: 42 });
 * ```
 */
export function createInputSchema(overrides: Partial<InputParamSchema> = {}): InputParamSchema {
	return {
		name: 'test',
		nickname: 'T',
		description: '',
		paramType: 'Number',
		treeAccess: false,
		groupName: null,
		minimum: null,
		maximum: null,
		atLeast: 1,
		atMost: 1,
		default: null,
		...overrides
	} as InputParamSchema;
}

/**
 * Creates a numeric input parameter schema (Number or Integer type)
 *
 * @example
 * ```typescript
 * const numInput = createNumericInputSchema({ default: 42 });
 * const intInput = createNumericInputSchema({ paramType: 'Integer', default: 10 });
 * const rangedInput = createNumericInputSchema({ minimum: 0, maximum: 100 });
 * ```
 */
export function createNumericInputSchema(
	overrides: Partial<InputParamSchema> = {}
): InputParamSchema {
	return createInputSchema({
		paramType: 'Number',
		...overrides
	});
}

/**
 * Creates a text input parameter schema
 *
 * @example
 * ```typescript
 * const textInput = createTextInputSchema({ default: 'hello' });
 * const multiText = createTextInputSchema({ default: ['a', 'b', 'c'] });
 * ```
 */
export function createTextInputSchema(overrides: Partial<InputParamSchema> = {}): InputParamSchema {
	return createInputSchema({
		paramType: 'Text',
		...overrides
	});
}

/**
 * Creates a boolean input parameter schema
 *
 * @example
 * ```typescript
 * const boolInput = createBooleanInputSchema({ default: true });
 * const multiBool = createBooleanInputSchema({ default: [true, false, true] });
 * ```
 */
export function createBooleanInputSchema(
	overrides: Partial<InputParamSchema> = {}
): InputParamSchema {
	return createInputSchema({
		paramType: 'Boolean',
		...overrides
	});
}

/**
 * Creates an integer input parameter schema with integer-specific defaults
 *
 * @example
 * ```typescript
 * const intInput = createIntegerInputSchema({ default: 5 });
 * const steppedInput = createIntegerInputSchema({ stepSize: 1 });
 * ```
 */
export function createIntegerInputSchema(
	overrides: Partial<InputParamSchema> = {}
): InputParamSchema {
	return createInputSchema({
		paramType: 'Integer',
		stepSize: 1,
		...overrides
	});
}

// ============================================================================
// LEGACY BUILDERS (Kept for backwards compatibility)
// ============================================================================

/**
 * Creates a mock Grasshopper input parameter (PascalCase format)
 * @deprecated Use createInputSchema() for new tests
 */
export function createMockGrasshopperInput(overrides: Partial<any> = {}) {
	return {
		Name: 'TestInput',
		Nickname: 'TI',
		Description: 'Test input parameter',
		AtLeast: 1,
		AtMost: 1,
		TypeHint: 'number',
		Default: null,
		...overrides
	};
}

/**
 * Creates a mock Grasshopper output parameter
 */
export function createMockGrasshopperOutput(overrides: Partial<any> = {}) {
	return {
		Name: 'TestOutput',
		Nickname: 'TO',
		Description: 'Test output parameter',
		...overrides
	};
}

/**
 * Creates a mock data tree structure
 */
export function createMockDataTree(values: any[] = [1, 2, 3]) {
	return values.map((value, index) => ({
		ParentID: index,
		type: typeof value,
		data: value
	}));
}

/**
 * Creates a mock Grasshopper response
 */
export function createMockGrasshopperResponse(overrides: Partial<any> = {}) {
	return {
		values: [],
		errors: [],
		warnings: [],
		...overrides
	};
}

/**
 * Creates a mock Three.js geometry
 */
export function createMockThreeGeometry() {
	return {
		vertices: [
			{ x: 0, y: 0, z: 0 },
			{ x: 1, y: 0, z: 0 },
			{ x: 1, y: 1, z: 0 }
		],
		faces: [[0, 1, 2]],
		normals: [
			{ x: 0, y: 0, z: 1 },
			{ x: 0, y: 0, z: 1 },
			{ x: 0, y: 0, z: 1 }
		]
	};
}
