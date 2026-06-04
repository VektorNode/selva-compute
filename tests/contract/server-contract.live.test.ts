/**
 * LIVE drift alarm — fetches the server contract from the source-of-truth
 * branch of VektorNode/compute.rhino3d and asserts its wire contract still
 * matches the committed snapshot.
 *
 * This is the test that fires when the SERVER changes a field the client
 * depends on. It needs network, so it is opt-in: it self-skips unless
 * RUN_LIVE_CONTRACT=1 (set in the scheduled CI job, see `pnpm contract:check`).
 * Normal local/CI unit runs stay offline and deterministic.
 *
 * Branch override: set SERVER_CONTRACT_REF=<branch> to check a different branch
 * (e.g. merge/8x) against the committed snapshot's field contract. The env var
 * flows through to the script unchanged.
 *
 * Mechanism: delegate to the script's `--check`, which re-parses live GitHub
 * source with the SAME parser the snapshot was built from and exits non-zero
 * with a field-level diff on any rename/recasing/add/remove.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const RUN_LIVE = process.env.RUN_LIVE_CONTRACT === '1';
const SERVER_REPO = 'VektorNode/compute.rhino3d';
const SERVER_REF = process.env.SERVER_CONTRACT_REF || 'Compute8';
const SCRIPT = resolve(__dirname, '../../scripts/fetch-server-contract.mjs');

describe.runIf(RUN_LIVE)('live server contract drift', () => {
	it(`matches ${SERVER_REPO}@${SERVER_REF}`, () => {
		// Delegate to the fetch script's `--check` mode. It runs in a plain
		// Node process (real global.fetch — the vitest setup stubs fetch, so we
		// can't fetch from inside the test runner), pulls the live C# source,
		// re-parses it with the SAME parser the snapshot was built from, and
		// exits non-zero with a field-level diff on any drift. SERVER_CONTRACT_REF
		// is inherited by the child, so the branch override applies here too.
		expect(() => {
			execFileSync('node', [SCRIPT, '--check'], {
				stdio: 'pipe',
				encoding: 'utf8'
			});
		}).not.toThrow();
	}, 20_000);
});

// Always-present marker so the file isn't reported as empty when skipped.
describe('live contract test wiring', () => {
	it('is opt-in via RUN_LIVE_CONTRACT=1', () => {
		expect(typeof RUN_LIVE).toBe('boolean');
	});
});
