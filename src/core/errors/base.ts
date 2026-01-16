import { ErrorCodes } from './error-codes';

/**
 * Simplified error for Rhino Compute operations
 *
 * @public Use this for error handling with error codes and context.
 */
export class RhinoComputeError extends Error {
	public readonly code: string;
	public readonly statusCode?: number;
	public readonly context?: Record<string, unknown>;
	public readonly originalError?: Error;

	constructor(
		message: string,
		code: string = 'UNKNOWN_ERROR',
		options?: { statusCode?: number; context?: Record<string, unknown>; originalError?: Error }
	) {
		super(message);
		this.name = 'RhinoComputeError';
		this.code = code;
		this.statusCode = options?.statusCode;
		this.context = options?.context;
		this.originalError = options?.originalError;

		// Support error chaining (Node.js 16.9+, TypeScript 4.6+)
		if ('cause' in Error.prototype) {
			Object.defineProperty(this, 'cause', {
				value: options?.originalError,
				enumerable: true
			});
		}
	}

	// ============================================================================
	// Static Validation Error Helpers
	// ============================================================================

	/**
	 * Create a generic validation error with custom reason
	 */
	static validation(inputName: string, reason: string, context?: Record<string, unknown>) {
		return new RhinoComputeError(`Input "${inputName}": ${reason}`, ErrorCodes.VALIDATION_ERROR, {
			context: { inputName, reason, ...context }
		});
	}

	/**
	 * Create an error for missing/empty values
	 */
	static missingValues(inputName: string, expectedType?: string, context?: Record<string, unknown>) {
		return new RhinoComputeError(
			`Input "${inputName}" has no values defined${expectedType ? ` (expected ${expectedType})` : ''}`,
			ErrorCodes.INVALID_INPUT,
			{ context: { inputName, expectedType, ...context } }
		);
	}

	/**
	 * Create an error for invalid default value in value list
	 */
	static invalidDefault(
		inputName: string,
		defaultValue: unknown,
		availableValues: unknown[],
		context?: Record<string, unknown>
	) {
		return new RhinoComputeError(
			`ValueList input "${inputName}" default value "${defaultValue}" is not in available values`,
			ErrorCodes.VALIDATION_ERROR,
			{ context: { inputName, defaultValue, availableValues, ...context } }
		);
	}

	/**
	 * Create an error for unknown parameter type
	 */
	static unknownParamType(paramType: string, paramName?: string, context?: Record<string, unknown>) {
		return new RhinoComputeError(`Unknown paramType: ${paramType}`, ErrorCodes.VALIDATION_ERROR, {
			context: { receivedParamType: paramType, paramName, ...context }
		});
	}

	/**
	 * Create an error for invalid input structure
	 */
	static invalidStructure(
		inputName: string,
		expectedStructure: string,
		context?: Record<string, unknown>
	) {
		return new RhinoComputeError(
			`Invalid input structure for "${inputName}" (expected ${expectedStructure})`,
			ErrorCodes.INVALID_INPUT,
			{ context: { inputName, expectedStructure, ...context } }
		);
	}
}
