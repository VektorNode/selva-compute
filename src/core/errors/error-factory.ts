import { RhinoComputeError } from './base';
import { ErrorCodes } from './error-codes';

/**
 * Factory functions for creating consistent error instances across the codebase.
 * Standardizes error creation patterns and reduces duplication.
 *
 * @internal This is an internal error factory module.
 */

export interface ValidationErrorOptions {
	inputName?: string;
	paramType?: string;
	receivedValue?: unknown;
	reason?: string;
}

export interface ErrorOptions {
	context?: Record<string, unknown>;
	statusCode?: number;
	originalError?: Error;
}

/**
 * Validation error factory - creates standardized validation errors
 */
export const ValidationErrors = {
	/**
	 * Create a generic validation error with custom reason
	 */
	invalid: (inputName: string, reason: string, options?: ErrorOptions) =>
		new RhinoComputeError(`Input "${inputName}": ${reason}`, ErrorCodes.VALIDATION_ERROR, {
			context: { inputName, reason, ...options?.context },
			...options
		}),

	/**
	 * Create an error for missing/empty values
	 */
	missingValues: (inputName: string, expectedType?: string, options?: ErrorOptions) =>
		new RhinoComputeError(
			`Input "${inputName}" has no values defined${expectedType ? ` (expected ${expectedType})` : ''}`,
			ErrorCodes.INVALID_INPUT,
			{
				context: { inputName, expectedType, ...options?.context },
				...options
			}
		),

	/**
	 * Create an error for invalid boolean value
	 */
	invalidBoolean: (value: unknown, inputName?: string, options?: ErrorOptions) =>
		new RhinoComputeError(
			`Invalid boolean value: ${value}${inputName ? ` in input "${inputName}"` : ''}`,
			ErrorCodes.VALIDATION_ERROR,
			{
				context: {
					receivedValue: value,
					inputName,
					expectedValues: ['true', 'false'],
					...options?.context
				},
				...options
			}
		),

	/**
	 * Create an error for invalid default value in value list
	 */
	invalidDefault: (
		inputName: string,
		defaultValue: unknown,
		availableValues: unknown[],
		options?: ErrorOptions
	) =>
		new RhinoComputeError(
			`ValueList input "${inputName}" default value "${defaultValue}" is not in available values`,
			ErrorCodes.VALIDATION_ERROR,
			{
				context: { inputName, defaultValue, availableValues, ...options?.context },
				...options
			}
		),

	/**
	 * Create an error for unknown parameter type
	 */
	unknownParamType: (paramType: string, paramName?: string, options?: ErrorOptions) =>
		new RhinoComputeError(`Unknown paramType: ${paramType}`, ErrorCodes.VALIDATION_ERROR, {
			context: { receivedParamType: paramType, paramName, ...options?.context },
			...options
		}),

	/**
	 * Create an error for invalid input structure
	 */
	invalidStructure: (inputName: string, expectedStructure: string, options?: ErrorOptions) =>
		new RhinoComputeError(
			`Invalid input structure for "${inputName}" (expected ${expectedStructure})`,
			ErrorCodes.INVALID_INPUT,
			{
				context: { inputName, expectedStructure, ...options?.context },
				...options
			}
		)
};

/**
 * Input processing error factory
 */
export const InputErrors = {
	/**
	 * Create an error for failed input parsing
	 */
	parseError: (inputName: string, inputType: string, reason: string, options?: ErrorOptions) =>
		new RhinoComputeError(
			`Failed to parse ${inputType} input "${inputName}": ${reason}`,
			ErrorCodes.INVALID_INPUT,
			{
				context: { inputName, inputType, reason, ...options?.context },
				...options
			}
		),

	/**
	 * Create an error for invalid input structure
	 */
	invalidStructure: (inputName: string, expectedStructure: string, options?: ErrorOptions) =>
		new RhinoComputeError(
			`Invalid input structure for "${inputName}" (expected ${expectedStructure})`,
			ErrorCodes.INVALID_INPUT,
			{
				context: { inputName, expectedStructure, ...options?.context },
				...options
			}
		)
};

/**
 * Data transformation error factory
 */
export const DataErrors = {
	/**
	 * Create an error for failed data transformation
	 */
	transformError: (dataType: string, reason: string, options?: ErrorOptions) =>
		new RhinoComputeError(
			`Data transformation error for ${dataType}: ${reason}`,
			ErrorCodes.COMPUTATION_ERROR,
			{
				context: { dataType, reason, ...options?.context },
				...options
			}
		),

	/**
	 * Create an error for invalid data type
	 */
	invalidType: (expectedType: string, receivedType: string, options?: ErrorOptions) =>
		new RhinoComputeError(
			`Invalid data type: expected ${expectedType}, received ${receivedType}`,
			ErrorCodes.VALIDATION_ERROR,
			{
				context: { expectedType, receivedType, ...options?.context },
				...options
			}
		)
};

/**
 * Configuration error factory
 */
export const ConfigErrors = {
	/**
	 * Create an error for invalid configuration
	 */
	invalid: (configName: string, reason: string, options?: ErrorOptions) =>
		new RhinoComputeError(
			`Invalid configuration "${configName}": ${reason}`,
			ErrorCodes.INVALID_CONFIG,
			{
				context: { configName, reason, ...options?.context },
				...options
			}
		),

	/**
	 * Create an error for missing required config property
	 */
	missingRequired: (configName: string, propertyName: string, options?: ErrorOptions) =>
		new RhinoComputeError(
			`Configuration "${configName}" is missing required property "${propertyName}"`,
			ErrorCodes.INVALID_CONFIG,
			{
				context: { configName, propertyName, ...options?.context },
				...options
			}
		)
};
