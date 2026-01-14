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
	debug(): void { }
	info(): void { }
	warn(): void { }
	error(): void { }
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
 *
 * @example
 * ```typescript
 * import { setLogger } from '@selva/compute';
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
	} else if ('debug' in logger && 'info' in logger && 'warn' in logger && 'error' in logger) {
		internalLogger = logger as Logger;
	} else {
		internalLogger = new ConsoleLogger();
	}
}

/**
 * Enable debug logging to console
 *
 * @public Convenience method to enable console logging.
 *
 * @example
 * ```typescript
 * import { enableDebugLogging } from '@selva/compute';
 *
 * enableDebugLogging();
 * ```
 */
export function enableDebugLogging(): void {
	setLogger(new ConsoleLogger());
}
