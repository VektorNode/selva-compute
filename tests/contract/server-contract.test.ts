/**
 * Seam test — the client's expectations vs. the Rhino Compute server's JSON
 * contract.
 *
 * These run OFFLINE against the committed snapshot
 * (`server-contract.snapshot.json`), which is generated from
 * VektorNode/compute.rhino3d@Compute8 by `pnpm contract:snapshot`. They fail
 * when the CLIENT stops matching the server contract — e.g. someone renames a
 * field the client reads, or the snapshot is refreshed to a server that dropped
 * a field.
 *
 * The companion live-drift test (`server-contract.live.test.ts`) is what fails
 * when the SERVER changes out from under the snapshot. Together: the snapshot is
 * the pinned contract, this file proves the client honors it, and the live test
 * proves the pin still matches GitHub.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { flatten, type ServerContract } from './parse-server-contract';

const SNAPSHOT: ServerContract = JSON.parse(
	readFileSync(resolve(__dirname, 'server-contract.snapshot.json'), 'utf8')
);

/** All-lowercase ASCII? (our proxy for "the .NET camelCase/lowercase wire name"). */
function isLowerOrCamel(name: string): boolean {
	// camelCase or lowercase: starts lower, no underscores/dashes.
	return /^[a-z][A-Za-z0-9]*$/.test(name);
}

describe('server contract snapshot integrity', () => {
	it('was generated from the Compute8 branch', () => {
		expect(SNAPSHOT.ref).toBe('Compute8');
	});

	it('contains every class the client depends on', () => {
		for (const cls of [
			'Schema',
			'IoResponseSchema',
			'InputParamSchema',
			'IoParamSchema',
			'ResthopperObject',
			'DataTree'
		]) {
			expect(SNAPSHOT.classes[cls], `missing class ${cls}`).toBeDefined();
		}
	});
});

// ===========================================================================
// Seam A — Solve request envelope (client → server `Schema`)
// ===========================================================================
//
// The client builds the solve/io request body in `prepareGrasshopperArgs` and
// `applyOptionalComputeSettings`. Every key it emits must be a field the server
// `Schema` accepts. (Newtonsoft binds case-insensitively, so the client's
// lowercase keys hit the server's camelCase fields — but the *name stem* must
// still exist, which is what we assert.)

describe('seam A — solve request keys the client sends exist on server Schema', () => {
	// Keys the client puts on the wire, mapped to the server Schema field they
	// must resolve to. Source: prepareGrasshopperArgs + applyOptionalComputeSettings.
	const CLIENT_REQUEST_KEYS: Record<string, string> = {
		algo: 'algo',
		pointer: 'pointer',
		values: 'values',
		cachesolve: 'cacheSolve',
		modelunits: 'modelUnits',
		angletolerance: 'angleTolerance',
		absolutetolerance: 'absoluteTolerance',
		dataversion: 'dataVersion'
	};

	const schemaFields = SNAPSHOT.classes.Schema.properties;

	for (const [clientKey, serverField] of Object.entries(CLIENT_REQUEST_KEYS)) {
		it(`'${clientKey}' resolves to server Schema.'${serverField}'`, () => {
			expect(schemaFields).toContain(serverField);
			// Case-insensitive binding is what makes the client's lowercase key work.
			expect(clientKey.toLowerCase()).toBe(serverField.toLowerCase());
		});
	}
});

// ===========================================================================
// Seam A — Solve response (server → client)
// ===========================================================================
//
// The response processor reads `param.ParamName` / `param.InnerTree` off each
// DataTree (PascalCase, no [JsonProperty]) and `item.type` / `item.data` /
// `item.id` off each ResthopperObject (lowercase [JsonProperty]).

describe('seam A — solve response fields the client reads', () => {
	it('DataTree exposes ParamName and InnerTree as PascalCase', () => {
		const props = SNAPSHOT.classes.DataTree.properties;
		expect(props).toContain('ParamName');
		expect(props).toContain('InnerTree');
		// These MUST stay PascalCase: the client reads them verbatim with no
		// camelCase conversion (unlike the IO response). A server-side rename to
		// camelCase here would silently empty every result.
		expect(props.every((p) => /^[A-Z]/.test(p))).toBe(true);
	});

	it('ResthopperObject exposes type, data, id as lowercase', () => {
		const props = SNAPSHOT.classes.ResthopperObject.properties;
		for (const field of ['type', 'data', 'id']) {
			expect(props).toContain(field);
		}
	});
});

// ===========================================================================
// Seam B — IO schema (server → client), the camelCase-standardized surface
// ===========================================================================
//
// fetchDefinitionIO reads these off the /io response. The README documents that
// the fork standardized IO serialization to camelCase; these pins make that
// promise enforceable.

describe('seam B — IO response fields the client reads', () => {
	// Field on the client's InputParamSchema/OutputParamSchema → must exist on
	// the server's flattened InputParamSchema (inherited IoParamSchema included).
	const CLIENT_INPUT_FIELDS = [
		'id',
		'name',
		'nickname',
		'description',
		'paramType',
		'treeAccess',
		'minimum',
		'maximum',
		'atLeast',
		'atMost',
		'default',
		'values',
		'groupName'
	];

	const inputFields = flatten(SNAPSHOT, 'InputParamSchema');

	for (const field of CLIENT_INPUT_FIELDS) {
		it(`InputParamSchema.'${field}' exists on the server`, () => {
			expect(inputFields).toContain(field);
		});
	}

	it('every IO input field is camelCase/lowercase (no PascalCase leak)', () => {
		// The client runs camelcaseKeys on the IO response; this asserts the
		// server already emits camelCase so that conversion is a no-op and the
		// raw shape matches the client's typed InputParamSchema directly.
		for (const field of inputFields) {
			expect(isLowerOrCamel(field), `'${field}' is not camelCase`).toBe(true);
		}
	});

	it('output params expose name, nickname, paramType, id', () => {
		const outputFields = flatten(SNAPSHOT, 'IoParamSchema');
		for (const field of ['name', 'nickname', 'paramType', 'id']) {
			expect(outputFields).toContain(field);
		}
	});

	it('IoResponseSchema carries inputs and outputs arrays', () => {
		const props = SNAPSHOT.classes.IoResponseSchema.properties;
		expect(props).toContain('inputs');
		expect(props).toContain('outputs');
	});
});

// ===========================================================================
// Fork-specific fields (the Selva/VektorNode enhancements)
// ===========================================================================
//
// These are the fields that only exist on the custom fork. The client marks
// them `@requires Custom branch`. If the snapshot ever loses one, the client's
// reliance on it (group breadcrumbs, value lists, param GUIDs) silently breaks.

describe('fork-specific IO fields are present on Compute8', () => {
	const inputFields = flatten(SNAPSHOT, 'InputParamSchema');

	it('groupName (hierarchical grouping) is present', () => {
		expect(inputFields).toContain('groupName');
	});

	it('values (value-list extraction) is present', () => {
		expect(inputFields).toContain('values');
	});

	it('id (param instance GUID) is present on params', () => {
		expect(inputFields).toContain('id');
	});

	it('id is present on ResthopperObject (per-value GUID)', () => {
		expect(SNAPSHOT.classes.ResthopperObject.properties).toContain('id');
	});
});
