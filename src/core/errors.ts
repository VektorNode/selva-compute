/**
 * Error types and codes for `@selvajs/compute`.
 */

export const ErrorCodes = {
	NETWORK_ERROR: 'NETWORK_ERROR',
	AUTH_ERROR: 'AUTH_ERROR',
	VALIDATION_ERROR: 'VALIDATION_ERROR',
	COMPUTATION_ERROR: 'COMPUTATION_ERROR',
	TIMEOUT_ERROR: 'TIMEOUT_ERROR',
	CORS_ERROR: 'CORS_ERROR',
	UNKNOWN_ERROR: 'UNKNOWN_ERROR',
	INVALID_STATE: 'INVALID_STATE',
	INVALID_INPUT: 'INVALID_INPUT',
	INVALID_CONFIG: 'INVALID_CONFIG',
	BROWSER_ONLY: 'BROWSER_ONLY',
	ENVIRONMENT_ERROR: 'ENVIRONMENT_ERROR',
	ENCODING_ERROR: 'ENCODING_ERROR',
	/** Scheduler latest-wins: this call was replaced by a newer one. */
	SUPERSEDED: 'SUPERSEDED',
	/** Scheduler / caller-supplied AbortSignal: this call was aborted. */
	ABORTED: 'ABORTED'
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

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
		if (options?.originalError) {
			(this as { cause?: unknown }).cause = options.originalError;
		}
	}

	// ============================================================================
	// Static Validation Error Helpers
	// ============================================================================

	/**
	 * Create an error for missing/empty values
	 */
	static missingValues(
		inputName: string,
		expectedType?: string,
		context?: Record<string, unknown>
	) {
		return new RhinoComputeError(
			`Input "${inputName}" has no values defined${expectedType ? ` (expected ${expectedType})` : ''}`,
			ErrorCodes.INVALID_INPUT,
			{ context: { inputName, expectedType, ...context } }
		);
	}

	/**
	 * Create an error for unknown parameter type
	 */
	static unknownParamType(
		paramType: string,
		paramName?: string,
		context?: Record<string, unknown>
	) {
		return new RhinoComputeError(`Unknown paramType: ${paramType}`, ErrorCodes.VALIDATION_ERROR, {
			context: { receivedParamType: paramType, paramName, ...context }
		});
	}
}
