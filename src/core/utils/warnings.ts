import { getLogger } from './logger';

export function warnIfClientSide(functionName: string, suppress?: boolean): void {
	if (suppress) {
		return;
	}

	if (typeof window !== 'undefined') {
		getLogger().warn(
			`Warning: ${functionName} is running on the client side. For better performance and security, consider running this on the server side.`
		);
	}
}
