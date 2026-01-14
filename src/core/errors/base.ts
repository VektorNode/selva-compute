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
}
