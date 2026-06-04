/**
 * Pins the server-branch override precedence used by the snapshot/check script:
 *   --ref=<branch>  >  SERVER_CONTRACT_REF env  >  committed default (Compute8)
 *
 * This is what lets `pnpm contract:check --ref=merge/8x` (or the env var) point
 * the live drift check at a branch other than the committed one without editing
 * any files.
 */
import { afterEach, describe, expect, it } from 'vitest';

// @ts-expect-error - .mjs script, resolved at runtime by vitest
import { resolveRef, DEFAULT_SERVER_REF } from '../../scripts/fetch-server-contract.mjs';

const ENV_KEY = 'SERVER_CONTRACT_REF';
const original = process.env[ENV_KEY];

afterEach(() => {
	if (original === undefined) delete process.env[ENV_KEY];
	else process.env[ENV_KEY] = original;
});

describe('resolveRef', () => {
	it('defaults to the committed branch (Compute8) with no flag or env', () => {
		delete process.env[ENV_KEY];
		expect(resolveRef(['node', 'script.mjs'])).toBe(DEFAULT_SERVER_REF);
		expect(DEFAULT_SERVER_REF).toBe('Compute8');
	});

	it('uses SERVER_CONTRACT_REF when set', () => {
		process.env[ENV_KEY] = 'merge/8x';
		expect(resolveRef(['node', 'script.mjs'])).toBe('merge/8x');
	});

	it('prefers the --ref flag over the env var', () => {
		process.env[ENV_KEY] = 'merge/8x';
		expect(resolveRef(['node', 'script.mjs', '--ref=feature/x'])).toBe('feature/x');
	});

	it('handles a --ref value that contains a slash', () => {
		delete process.env[ENV_KEY];
		expect(resolveRef(['node', 'script.mjs', '--check', '--ref=release/8.3.0'])).toBe(
			'release/8.3.0'
		);
	});

	it('ignores unrelated args', () => {
		delete process.env[ENV_KEY];
		expect(resolveRef(['node', 'script.mjs', '--check'])).toBe(DEFAULT_SERVER_REF);
	});
});
