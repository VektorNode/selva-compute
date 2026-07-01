import { RhinoComputeError } from '@/core/errors';
import { getLogger } from '@/core';
import { isDataTreeDefault } from '../../data-tree/tree-path';
import type {
	BaseInputType,
	BooleanInputType,
	ColorInputType,
	FileInputType,
	GeometryInputType,
	InputParam,
	InputParamSchema,
	NumericInputType,
	TextInputType,
	ValueListInputType
} from '../../types';

/**
 * @internal The input-type parser seam.
 *
 * One adapter per Grasshopper param type. A parser owns EVERYTHING about its
 * type: value coercion, type-specific fields (e.g. numeric step size), the
 * typed-param construction, and its own safe fallback when input is bad. New
 * param types plug in by adding an entry to {@link INPUT_TYPE_PARSERS}.
 *
 * Parsers are pure: they read from a (already-`normalizeDefault`'d) schema and
 * return a typed param. They do not mutate the schema. `parse` throws a
 * {@link RhinoComputeError} on recoverable bad input; the registry boundary
 * catches it and pairs it with `fallback`.
 */
export interface InputTypeParser<T extends InputParam = InputParam> {
	/** Canonical paramType(s) this parser owns, e.g. ['Number','Integer']. */
	readonly types: readonly string[];
	/** Schema (with normalized default) → typed param. Throws on bad input. */
	parse(schema: InputParamSchema, base: BaseInputType): T;
	/** This type's safe fallback param when {@link parse} throws. */
	fallback(schema: InputParamSchema, base: BaseInputType): T;
}

// ============================================================================
// Value transformers (ported verbatim from the old input-parsers.ts)
// ============================================================================

type ValueTransformer<T> = (value: unknown) => T | null;

/**
 * Coerce a schema's `default` through a transformer, mirroring the old
 * `processInputValue`: arrays map+filter (empty → undefined), scalars
 * transform-or-(undefined|preserve). Returns the new default value rather than
 * mutating.
 */
function coerceDefault<T>(
	value: unknown,
	transform: ValueTransformer<T>,
	setUndefinedOnEmpty: boolean
): unknown {
	if (value === undefined || value === null) {
		return value;
	}

	if (Array.isArray(value)) {
		const processed = value.map(transform).filter((v): v is T => v !== null);
		return processed.length > 0 ? processed : undefined;
	}

	const transformed = transform(value);
	if (transformed !== null) {
		return transformed;
	}
	return setUndefinedOnEmpty ? undefined : value;
}

const numericTransformer: ValueTransformer<number> = (value) => {
	if (typeof value === 'number') return value;
	if (typeof value === 'string') {
		const trimmed = value.trim();
		// `Number('')` is 0, so reject empty/whitespace before coercing — an empty
		// default should drop to null, not silently become 0.
		if (trimmed === '') return null;
		const parsed = Number(trimmed);
		return Number.isNaN(parsed) ? null : parsed;
	}
	return null;
};

const booleanTransformer: ValueTransformer<boolean> = (value) => {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'string') {
		const lower = value.toLowerCase();
		if (lower === 'true') return true;
		if (lower === 'false') return false;
		throw new Error(`Invalid boolean string: "${value}"`);
	}
	return null;
};

const textTransformer: ValueTransformer<string> = (value) => {
	if (typeof value === 'string') {
		if (value.length >= 2 && value.startsWith('"') && value.endsWith('"'))
			return value.slice(1, -1);
		// Unbalanced leading quote: strip only the quote, not the last character.
		if (value.startsWith('"')) return value.slice(1);
		return value;
	}
	return null;
};

const colorTransformer: ValueTransformer<string> = (value) => {
	if (typeof value === 'string') {
		let cleaned = value.trim();
		if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
			cleaned = cleaned.slice(1, -1).trim();
		}
		return cleaned;
	}
	return null;
};

function objectTransformer(inputName: string): ValueTransformer<object> {
	return (value) => {
		if (typeof value === 'object' && value !== null) return value;
		if (typeof value === 'string' && value.trim() !== '') {
			try {
				const parsed = JSON.parse(value);
				if (typeof parsed === 'object' && parsed !== null) return parsed;
				getLogger().warn(`Parsed value for input ${inputName} is not an object`);
				return null;
			} catch (err) {
				getLogger().warn(`Failed to parse object value "${value}" for input ${inputName}`, err);
				return null;
			}
		}
		return null;
	};
}

// ============================================================================
// Numeric step-size + precision (ported verbatim)
// ============================================================================

function applyRounding(value: number, decimalPlaces: number, tolerance: number): number {
	const rounded = Number(value.toFixed(decimalPlaces));
	if (Math.abs(value - rounded) < tolerance) return rounded;
	return value;
}

function getInputStepSize(value: number, roundingTolerance: number): number {
	if (!Number.isFinite(value)) return 0.1;
	if (value === 0) return 0.1;

	const abs = Math.abs(value);

	if (abs >= 1) {
		const str = String(value);
		const decimalPart = str.split('.')[1];
		if (decimalPart && decimalPart.length > 0) {
			const decimals = Math.min(decimalPart.length, 12);
			const step = Math.pow(10, -decimals);
			const rounded = Number(step.toFixed(decimals));
			return Math.abs(rounded - step) < roundingTolerance ? rounded : step;
		}
		return 1;
	}

	// Handle exponential notation
	const s = String(value);
	const expMatch = s.toLowerCase().match(/e(-?\d+)/);
	if (expMatch) {
		const exp = Number(expMatch[1]);
		if (exp < 0 || s.toLowerCase().includes('e-')) {
			const absExp = Math.abs(exp);
			const step = Math.pow(10, -absExp);
			const rounded = Number(step.toFixed(absExp));
			return Math.abs(rounded - step) < roundingTolerance ? rounded : step;
		}
		return 0.1;
	}

	// Handle standard decimal notation
	const MAX_DECIMALS = 12;
	const fixed = abs.toFixed(MAX_DECIMALS);
	const trimmed = fixed.replace(/0+$/, '');
	const decimals = Math.min((trimmed.split('.')[1] || '').length, MAX_DECIMALS);

	if (decimals === 0) return 0.1;

	const step = Math.pow(10, -decimals);
	const rounded = Number(step.toFixed(decimals));
	return Math.abs(rounded - step) < roundingTolerance ? rounded : step;
}

/**
 * Computes the coerced default + stepSize for a Number/Integer input.
 * Mirrors the old `processNumericInput` exactly.
 */
function computeNumeric(
	schema: InputParamSchema,
	roundingTolerance = 1e-8
): { default: NumericInputType['default']; stepSize: number } {
	const isIntegerType = schema.paramType === 'Integer';

	// A tree-access default is a DataTreeDefault keyed by branch paths; pass it
	// through untouched (numeric constraints are applied later by TreeBuilder).
	// Without this guard the scalar numericTransformer mangles the tree object to
	// `undefined`, silently dropping a tree-access slider's default. Sharing
	// `isDataTreeDefault` with TreeBuilder guarantees we pass through exactly the
	// values it will treat as trees — no looser, no stricter.
	if (isDataTreeDefault(schema.default)) {
		return {
			default: schema.default as NumericInputType['default'],
			stepSize: isIntegerType ? 1 : 0.1
		};
	}

	let value = coerceDefault(schema.default, numericTransformer, true);

	if (isIntegerType) {
		if (Array.isArray(value)) {
			value = value.map((val) => (typeof val === 'number' ? Math.round(val) : val));
		} else if (typeof value === 'number') {
			value = Math.round(value);
		}
		return { default: value as NumericInputType['default'], stepSize: 1 };
	}

	const firstValue = Array.isArray(value) ? value[0] : value;

	let stepSource: number | undefined;
	if (typeof firstValue === 'number' && Number.isFinite(firstValue) && firstValue !== 0) {
		stepSource = firstValue;
	} else if (
		typeof schema.minimum === 'number' &&
		Number.isFinite(schema.minimum) &&
		schema.minimum !== 0
	) {
		stepSource = schema.minimum;
	} else if (
		typeof schema.maximum === 'number' &&
		Number.isFinite(schema.maximum) &&
		schema.maximum !== 0
	) {
		stepSource = schema.maximum;
	}

	const stepSize = stepSource !== undefined ? getInputStepSize(stepSource, roundingTolerance) : 0.1;

	// Apply precision to all numeric values
	let decimalPlaces = 0;
	const stepStr = String(stepSize);
	const expMatch = stepStr.toLowerCase().match(/e(-?\d+)/);
	if (expMatch) {
		decimalPlaces = Math.abs(Number(expMatch[1]));
	} else {
		decimalPlaces = stepStr.split('.')[1]?.length ?? 0;
	}

	if (
		decimalPlaces === 0 &&
		typeof firstValue === 'number' &&
		firstValue !== 0 &&
		Math.abs(firstValue) < 1
	) {
		const inferred = Math.ceil(-Math.log10(Math.abs(firstValue)));
		if (Number.isFinite(inferred) && inferred > 0) {
			decimalPlaces = inferred;
		}
	}

	decimalPlaces = Math.min(Math.max(decimalPlaces, 0), 12);

	if (Array.isArray(value)) {
		value = value.map((val) =>
			typeof val === 'number' ? applyRounding(val, decimalPlaces, roundingTolerance) : val
		);
	} else if (typeof value === 'number') {
		value = applyRounding(value, decimalPlaces, roundingTolerance);
	}

	return { default: value as NumericInputType['default'], stepSize };
}

// ============================================================================
// Parsers — one per type
// ============================================================================

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

const booleanParser: InputTypeParser<BooleanInputType> = {
	types: ['Boolean'],
	parse(schema, base) {
		let value: unknown;
		try {
			value = coerceDefault(schema.default, booleanTransformer, false);
		} catch (error) {
			// Mirror old processBooleanInput: re-throw as RhinoComputeError.
			if (error instanceof Error) throw new RhinoComputeError(error.message);
			throw error;
		}
		return { ...base, paramType: 'Boolean', default: value as BooleanInputType['default'] };
	},
	fallback(schema, base) {
		const isList = (schema.atMost ?? 1) > 1;
		return { ...base, paramType: 'Boolean', default: isList ? [false] : false };
	}
};

const textParser: InputTypeParser<TextInputType> = {
	types: ['Text'],
	parse(schema, base) {
		const value = coerceDefault(schema.default, textTransformer, false);
		return { ...base, paramType: 'Text', default: value as TextInputType['default'] };
	},
	fallback(schema, base) {
		const isList = (schema.atMost ?? 1) > 1;
		return { ...base, paramType: 'Text', default: isList ? [''] : '' };
	}
};

const valueListParser: InputTypeParser<ValueListInputType> = {
	types: ['ValueList'],
	parse(schema, base) {
		if (
			!schema.values ||
			typeof schema.values !== 'object' ||
			Object.keys(schema.values).length === 0
		) {
			throw RhinoComputeError.missingValues(schema.nickname || 'unnamed', 'ValueList');
		}

		// Out-of-range default only warns — it still succeeds (pinned behavior).
		if (schema.default !== undefined && schema.default !== null) {
			const defaultLower = String(schema.default).toLowerCase();
			const exists = Object.keys(schema.values).some((key) => key.toLowerCase() === defaultLower);
			if (!exists) {
				getLogger().warn(
					`ValueList input "${schema.nickname || 'unnamed'}" default value "${schema.default}" is not in available values`
				);
			}
		}

		return {
			...base,
			paramType: 'ValueList',
			values: schema.values as Record<string, string>,
			default: schema.default as string | undefined
		};
	},
	fallback(schema, base) {
		const isList = (schema.atMost ?? 1) > 1;
		return {
			...base,
			paramType: 'ValueList',
			values: schema.values ?? {},
			default: isList ? ([schema.default] as any) : schema.default
		};
	}
};

const geometryParser: InputTypeParser<GeometryInputType> = {
	types: ['Geometry'],
	parse(schema, base) {
		const value = coerceDefault(
			schema.default,
			objectTransformer(schema.nickname || 'unnamed'),
			true
		);
		return {
			...base,
			paramType: 'Geometry',
			default: value as GeometryInputType['default']
		};
	},
	fallback(schema, base) {
		const isList = (schema.atMost ?? 1) > 1;
		return { ...base, paramType: 'Geometry', default: isList ? [null] : (null as any) };
	}
};

const fileParser: InputTypeParser<FileInputType> = {
	types: ['File'],
	parse(schema, base) {
		const value = coerceDefault(
			schema.default,
			objectTransformer(schema.nickname || 'unnamed'),
			true
		);
		return {
			...base,
			paramType: 'File',
			acceptedFormats: schema.acceptedFormats,
			default: value as FileInputType['default']
		};
	},
	fallback(schema, base) {
		const isList = (schema.atMost ?? 1) > 1;
		return { ...base, paramType: 'File', default: isList ? [null] : (null as any) };
	}
};

const colorParser: InputTypeParser<ColorInputType> = {
	types: ['Color'],
	parse(schema, base) {
		const value = coerceDefault(schema.default, colorTransformer, false);
		return { ...base, paramType: 'Color', default: value as ColorInputType['default'] };
	},
	fallback(schema, base) {
		const isList = (schema.atMost ?? 1) > 1;
		return { ...base, paramType: 'Color', default: isList ? ['0, 0, 0'] : '0, 0, 0' };
	}
};

// ============================================================================
// Registry
// ============================================================================

const ALL_PARSERS: InputTypeParser[] = [
	numericParser,
	booleanParser,
	textParser,
	valueListParser,
	geometryParser,
	fileParser,
	colorParser
];

/** Registry keyed by canonical paramType. */
export const INPUT_TYPE_PARSERS: ReadonlyMap<string, InputTypeParser> = new Map(
	ALL_PARSERS.flatMap((parser) => parser.types.map((type) => [type, parser] as const))
);

/**
 * The Geometry parser is the registry's fallback for an unknown paramType,
 * matching the old `createSafeDefault` default branch (geometry-shaped null).
 */
export const UNKNOWN_TYPE_FALLBACK: InputTypeParser = geometryParser;
