import { RhinoComputeError, ErrorCodes } from '../errors';

/**
 * Logger interface for structured logging
 *
 * @public Implement this interface to provide custom logging behavior.
 */
export interface Logger {
	debug(message: string, ...args: unknown[]): void;
	info(message: string, ...args: unknown[]): void;
	warn(message: string, ...args: unknown[]): void;
	error(message: string, ...args: unknown[]): void;
}

/**
 * No-op logger implementation (default)
 * @internal
 */
class NoOpLogger implements Logger {
	debug(): void {}
	info(): void {}
	warn(): void {}
	error(): void {}
}

/**
 * Console logger implementation
 * @internal
 */
class ConsoleLogger implements Logger {
	debug(message: string, ...args: unknown[]): void {
		console.debug(message, ...args);
	}

	info(message: string, ...args: unknown[]): void {
		console.info(message, ...args);
	}

	warn(message: string, ...args: unknown[]): void {
		console.warn(message, ...args);
	}

	error(message: string, ...args: unknown[]): void {
		console.error(message, ...args);
	}
}

/**
 * Internal logger instance
 * @internal
 */
let internalLogger: Logger = new NoOpLogger();

/**
 * Get the current logger instance
 *
 * @returns The current logger instance
 */
export function getLogger(): Logger {
	return internalLogger;
}

/**
 * Set a custom logger instance
 *
 * @public Use this to configure custom logging behavior.
 *
 * @param logger - Custom logger implementation or null to disable logging
 * @throws {RhinoComputeError} `INVALID_CONFIG` if the logger is missing any of
 *   the four required methods — failing here beats a confusing
 *   "getLogger().debug is not a function" at some later, unrelated call site.
 *
 * @example
 * ```typescript
 * import { setLogger } from '@selvajs/compute';
 *
 * // Enable console logging
 * setLogger(console);
 *
 * // Use a custom logger
 * setLogger({
 *   debug: (msg, ...args) => myLogger.debug(msg, ...args),
 *   info: (msg, ...args) => myLogger.info(msg, ...args),
 *   warn: (msg, ...args) => myLogger.warn(msg, ...args),
 *   error: (msg, ...args) => myLogger.error(msg, ...args)
 * });
 *
 * // Disable logging
 * setLogger(null);
 * ```
 */
export function setLogger(logger: Logger | Console | null): void {
	if (logger === null) {
		internalLogger = new NoOpLogger();
		return;
	}

	const missing = (['debug', 'info', 'warn', 'error'] as const).filter(
		(method) => typeof (logger as unknown as Record<string, unknown>)[method] !== 'function'
	);
	if (missing.length > 0) {
		throw new RhinoComputeError(
			`Logger is missing required method(s): ${missing.join(', ')}. A logger must implement debug, info, warn and error.`,
			ErrorCodes.INVALID_CONFIG,
			{ context: { missingMethods: missing } }
		);
	}

	internalLogger = logger as Logger;
}

/**
 * Enable debug logging to console
 *
 * @public Convenience method to enable console logging.
 *
 * @example
 * ```typescript
 * import { enableDebugLogging } from '@selvajs/compute';
 *
 * enableDebugLogging();
 * ```
 */
export function enableDebugLogging(): void {
	setLogger(new ConsoleLogger());
}
