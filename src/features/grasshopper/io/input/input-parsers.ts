import { RhinoComputeError } from '@/core/errors';
import { getLogger } from '@/core';
import type { InputParamSchema } from '../../types';

/**
 * Type for a single value transformer function
 */
export type ValueTransformer<T> = (value: unknown) => T | null;

/**
 * Options for processing input values
 */
export interface ProcessValueOptions<T> {
	/**
	 * Function to transform a single value
	 */
	transform: ValueTransformer<T>;
	/**
	 * Whether to set default to undefined if all values fail transformation
	 * @default true
	 */
	setUndefinedOnEmpty?: boolean;
}

/**
 * Generic utility to process input default values (arrays or single values)
 *
 * @internal
 */
function processInputValue<T>(input: InputParamSchema, options: ProcessValueOptions<T>): void {
	const { transform, setUndefinedOnEmpty = true } = options;

	// Don't process undefined or null - preserve them as is
	if (input.default === undefined || input.default === null) {
		return;
	}

	if (Array.isArray(input.default)) {
		const processedArray = input.default.map(transform).filter((v): v is T => v !== null);

		// For arrays, always set to undefined if empty (regardless of setUndefinedOnEmpty)
		input.default = processedArray.length > 0 ? processedArray : undefined;
	} else {
		const transformed = transform(input.default);
		if (transformed !== null) {
			// Transformation succeeded
			input.default = transformed;
		} else {
			// Transformation failed - set to undefined only if setUndefinedOnEmpty is true
			if (setUndefinedOnEmpty) {
				input.default = undefined;
			}
			// Otherwise preserve original value
		}
	}
}

/**
 * Creates a numeric value transformer (for Number and Integer types)
 */
function createNumericTransformer(): ValueTransformer<number> {
	return (value: unknown): number | null => {
		if (typeof value === 'number') {
			return value;
		}
		if (typeof value === 'string') {
			const parsed = Number(value.trim());
			return Number.isNaN(parsed) ? null : parsed;
		}
		return null;
	};
}

/**
 * Creates a boolean value transformer
 */
function createBooleanTransformer(): ValueTransformer<boolean> {
	return (value: unknown): boolean | null => {
		if (typeof value === 'boolean') {
			return value;
		}
		if (typeof value === 'string') {
			const lowerValue = value.toLowerCase();
			if (lowerValue === 'true') return true;
			if (lowerValue === 'false') return false;
			throw new Error(`Invalid boolean string: "${value}"`);
		}
		return null;
	};
}

/**
 * Creates a text value transformer that removes surrounding quotes
 */
function createTextTransformer(): ValueTransformer<string> {
	return (value: unknown): string | null => {
		if (typeof value === 'string') {
			// Handle strings with both start and end quotes
			if (value.startsWith('"') && value.endsWith('"')) {
				return value.slice(1, -1);
			}
			// Handle strings that start with quote but don't end with one (legacy behavior)
			if (value.startsWith('"')) {
				return value.slice(1, -1);
			}
			return value;
		}
		return null;
	};
}

/**
 * Creates a color value transformer that normalizes RGB strings
 */
function createColorTransformer(): ValueTransformer<string> {
	return (value: unknown): string | null => {
		if (typeof value === 'string') {
			// Remove surrounding quotes if present
			let cleaned = value.trim();
			if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
				cleaned = cleaned.slice(1, -1).trim();
			}
			// Return as-is if it's a valid RGB string
			return cleaned;
		}
		return null;
	};
}

/**
 * Processes color input parameters
 */
function processColorInput(input: InputParamSchema): void {
	processInputValue(input, {
		transform: createColorTransformer(),
		setUndefinedOnEmpty: false
	});
}

/**
 * Creates an object value transformer that parses JSON strings
 */
function createObjectTransformer(inputName: string = 'unknown'): ValueTransformer<object> {
	return (value: unknown): object | null => {
		if (typeof value === 'object' && value !== null) {
			return value;
		}
		if (typeof value === 'string' && value.trim() !== '') {
			try {
				const parsed = JSON.parse(value);
				if (typeof parsed === 'object' && parsed !== null) {
					return parsed;
				}
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

/**
 * Applies rounding with tolerance to avoid floating-point artifacts
 */
function applyRounding(value: number, decimalPlaces: number, tolerance: number): number {
	const rounded = Number(value.toFixed(decimalPlaces));

	// If the difference is within tolerance, use the rounded value
	if (Math.abs(value - rounded) < tolerance) {
		return rounded;
	}

	return value;
}

/**
 * Calculates the step size for a given numeric input value based on its decimal precision.
 */
function getInputStepSize(value: number, roundingTolerance: number = 1e-8): number {
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
 * Processes numeric input parameters including step size and decimal places
 */
function processNumericInput(input: InputParamSchema, roundingTolerance: number = 1e-8): void {
	const isIntegerType = input.paramType === 'Integer';

	// Convert string values to numbers
	processInputValue(input, {
		transform: createNumericTransformer()
	});

	// Round to integer if it's an integer type
	if (isIntegerType) {
		if (Array.isArray(input.default)) {
			input.default = input.default.map((val) => (typeof val === 'number' ? Math.round(val) : val));
		} else if (typeof input.default === 'number') {
			input.default = Math.round(input.default);
		}

		// Integer inputs always have step size of 1
		input.stepSize = 1;
		return;
	}

	// Calculate step size from the first numeric value
	const firstValue = Array.isArray(input.default) ? input.default[0] : input.default;

	let stepSource: number | undefined;

	if (typeof firstValue === 'number' && Number.isFinite(firstValue) && firstValue !== 0) {
		stepSource = firstValue;
	} else if (
		typeof input.minimum === 'number' &&
		Number.isFinite(input.minimum) &&
		input.minimum !== 0
	) {
		stepSource = input.minimum;
	} else if (
		typeof input.maximum === 'number' &&
		Number.isFinite(input.maximum) &&
		input.maximum !== 0
	) {
		stepSource = input.maximum;
	}

	if (stepSource !== undefined) {
		input.stepSize = getInputStepSize(stepSource, roundingTolerance);
	} else {
		input.stepSize = 0.1;
	}

	// Apply precision to all numeric values
	if (typeof input.stepSize === 'number') {
		let decimalPlaces = 0;
		const stepStr = String(input.stepSize);

		const expMatch = stepStr.toLowerCase().match(/e(-?\d+)/);
		if (expMatch) {
			decimalPlaces = Math.abs(Number(expMatch[1]));
		} else {
			decimalPlaces = stepStr.split('.')[1]?.length ?? 0;
		}

		// Infer decimal places from small values when step size doesn't provide enough precision
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

		// Apply precision to all values
		if (Array.isArray(input.default)) {
			input.default = input.default.map((val) =>
				typeof val === 'number' ? applyRounding(val, decimalPlaces, roundingTolerance) : val
			);
		} else if (typeof input.default === 'number') {
			input.default = applyRounding(input.default, decimalPlaces, roundingTolerance);
		}
	}
}

/**
 * Processes boolean input parameters
 */
function processBooleanInput(input: InputParamSchema): void {
	try {
		processInputValue(input, {
			transform: createBooleanTransformer(),
			setUndefinedOnEmpty: false
		});
	} catch (error) {
		// Re-throw as RhinoComputeError for consistency
		if (error instanceof Error) {
			throw new RhinoComputeError(error.message);
		}
		throw error;
	}
}

/**
 * Processes text input parameters
 */
function processTextInput(input: InputParamSchema): void {
	processInputValue(input, {
		transform: createTextTransformer(),
		setUndefinedOnEmpty: false
	});
}

/**
 * Processes object input parameters by parsing JSON strings
 */
function parseToObject(input: InputParamSchema): void {
	processInputValue(input, {
		transform: createObjectTransformer(input.nickname || 'unnamed'),
		setUndefinedOnEmpty: true
	});
}

/**
 * Processes a ValueList input parameter.
 * Validates that the values object exists and contains at least one entry.
 */
function processValueListInput(input: InputParamSchema): void {
	if (!input.values || typeof input.values !== 'object' || Object.keys(input.values).length === 0) {
		throw RhinoComputeError.missingValues(input.nickname || 'unnamed', 'ValueList');
	}

	// Validate that default is one of the available values (if default exists)
	if (input.default !== undefined && input.default !== null) {
		// Case-insensitive check
		const defaultLower = String(input.default).toLowerCase();
		const valueExists = Object.keys(input.values).some((key) => key.toLowerCase() === defaultLower);

		if (!valueExists) {
			getLogger().warn(
				`ValueList input "${input.nickname || 'unnamed'}" default value "${input.default}" is not in available values`
			);
		}
	}
}

/**
 * Maps parameter types to their parsing functions
 */
export const PARSERS: Record<string, (input: InputParamSchema) => void> = {
	Number: processNumericInput,
	Integer: processNumericInput,
	Boolean: processBooleanInput,
	Text: processTextInput,
	ValueList: processValueListInput,
	Geometry: parseToObject,
	File: parseToObject,
	Color: processColorInput
};

// Export parser functions for direct use
export {
	processNumericInput,
	processBooleanInput,
	processTextInput,
	parseToObject,
	processValueListInput,
	processColorInput
};
