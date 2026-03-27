import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import 'dotenv/config';

import {
	GrasshopperClient,
	type GrasshopperComputeConfig,
	TreeBuilder,
	GrasshopperResponseProcessor
} from '../src/features/grasshopper';

//npx tsx examples/simple_example.ts

// ─── Config ──────────────────────────────────────────────────────────────────

// Use a URL or a local file path for the definition.
// If DEFINITION_URL is set, it takes priority over DEFINITION_PATH.
const DEFINITION_URL: string | undefined = undefined; // e.g. 'https://example.com/definition.gh'
const DEFINITION_PATH = join(process.cwd(), 'examples/files/simple_api_test.gh');
const COMPUTE_SERVER = process.env.COMPUTE_SERVER || 'http://localhost:6500';
const API_KEY = process.env.API_KEY || '';

const INPUT_TO_MODIFY = 'number_input_2';
const INPUT_NEW_VALUE = 50;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function section(title: string) {
	const bar = '─'.repeat(60);
	console.error(`\n${bar}`);
	console.error(`  ${title}`);
	console.error(bar);
}

function ok(msg: string, ms?: number) {
	const timing = ms !== undefined ? ` (${ms.toFixed(1)}ms)` : '';
	console.error(`  ✓ ${msg}${timing}`);
}

function warnMsg(msg: string) {
	console.warn(`  ⚠ ${msg}`);
}

function fail(msg: string) {
	console.error(`  ✗ ${msg}`);
}

function timer(): () => number {
	const start = performance.now();
	return () => performance.now() - start;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	const totalTimer = timer();

	const config = {
		serverUrl: COMPUTE_SERVER,
		debug: false,
		apiKey: API_KEY,
		cachesolve: false
	} as GrasshopperComputeConfig;

	let client: GrasshopperClient | null = null;

	try {
		// ── 1. Read definition (file or URL) ──────────────────────────────────
		section('1. Definition');
		const t1 = timer();
		let definition: string | Buffer;
		if (DEFINITION_URL) {
			definition = DEFINITION_URL;
			ok(`Using URL: ${DEFINITION_URL}`, t1());
		} else {
			definition = await readFile(DEFINITION_PATH);
			ok(`Read ${definition.length.toLocaleString()} bytes from ${DEFINITION_PATH}`, t1());
		}

		// ── 2. Server connection + stats ──────────────────────────────────────
		section('2. Server Connection & Stats');
		const t2 = timer();
		client = await GrasshopperClient.create(config);
		ok(`Connected to ${COMPUTE_SERVER}`, t2());

		const t2s = timer();
		const serverStats = await client.serverStats.getServerStats();
		ok(`Server stats fetched`, t2s());
		console.error(`  • Online:          ${serverStats.isOnline}`);
		if (serverStats.version) {
			console.error(`  • Rhino version:   ${serverStats.version.rhino}`);
			console.error(`  • Compute version: ${serverStats.version.compute}`);
			if (serverStats.version.git_sha) {
				console.error(`  • Git SHA:         ${serverStats.version.git_sha}`);
			}
		}
		if (serverStats.activeChildren !== undefined) {
			console.error(`  • Active children: ${serverStats.activeChildren}`);
		}

		// ── 3. Definition IO ──────────────────────────────────────────────────
		section('3. Definition I/O');
		const t3 = timer();
		const io = await client.getIO(definition);
		ok(`Fetched IO: ${io.inputs.length} inputs, ${io.outputs.length} outputs`, t3());

		console.error('\n  Inputs:');
		for (const input of io.inputs) {
			const n = input as typeof input & {
				id?: string;
				groupName?: string;
				atLeast?: number;
				atMost?: number;
			};
			console.error(`    • ${input.name}`);
			console.error(`      nickname:   ${input.nickname ?? '–'}`);
			console.error(`      paramType:  ${input.paramType}`);
			console.error(`      treeAccess: ${input.treeAccess}`);
			if (n.id) console.error(`      id:         ${n.id}`);
			if (n.groupName) console.error(`      groupName:  ${n.groupName}`);
			if (input.description) console.error(`      description: ${input.description}`);
			if (input.paramType !== 'ValueList') {
				console.error(
					`      default:    ${JSON.stringify((input as { default: unknown }).default)}`
				);
			}
			if ('minimum' in input && input.minimum != null)
				console.error(`      minimum:    ${input.minimum}`);
			if ('maximum' in input && input.maximum != null)
				console.error(`      maximum:    ${input.maximum}`);
			if ('stepSize' in input && input.stepSize != null)
				console.error(`      stepSize:   ${input.stepSize}`);
			if ('atLeast' in input && input.atLeast != null)
				console.error(`      atLeast:    ${input.atLeast}`);
			if ('atMost' in input && input.atMost != null)
				console.error(`      atMost:     ${input.atMost}`);
			if ('values' in input) console.error(`      values:     ${JSON.stringify(input.values)}`);
			if ('acceptedFormats' in input && input.acceptedFormats) {
				console.error(`      formats:    ${input.acceptedFormats.join(', ')}`);
			}
		}

		console.error('\n  Outputs:');
		for (const output of io.outputs) {
			console.error(`    • ${output.name} (${output.nickname ?? '–'})  [${output.paramType}]`);
		}

		// ── 4. Build input tree ───────────────────────────────────────────────
		section('4. Input Tree');
		const inputTree = TreeBuilder.fromInputParams(io.inputs);

		const inputExists = io.inputs.some((i) => i.name === INPUT_TO_MODIFY);
		if (inputExists) {
			TreeBuilder.replaceTreeValue(inputTree, INPUT_TO_MODIFY, INPUT_NEW_VALUE);
			ok(`Set "${INPUT_TO_MODIFY}" → ${INPUT_NEW_VALUE}`);
		} else {
			warnMsg(`Input "${INPUT_TO_MODIFY}" not found — skipping override`);
		}

		console.log(`\n  Input Tree:\n${JSON.stringify(inputTree, null, 2).split('\n').join('\n  ')}`);
		// ── 5. Solve via client ───────────────────────────────────────────────
		section('5. Computation (via client)');
		const t5 = timer();
		const result = await client.solve(definition, inputTree);
		const solveMs = t5();
		ok(`Solve completed`, solveMs);

		// ── 5b. Raw fetch (bypass client) ─────────────────────────────────────
		section('5b. Raw fetch (bypass client)');
		const algo =
			typeof definition === 'string'
				? undefined // URL-based — send pointer instead of base64 blob
				: Buffer.from(definition).toString('base64');
		const body = JSON.stringify({
			...(algo ? { algo } : { pointer: definition }),
			values: inputTree
		});
		console.error(`  Request body size: ${body.length} bytes`);
		console.error(
			`  Request values: ${JSON.stringify(inputTree, null, 2).split('\n').join('\n  ')}`
		);

		const t5b = timer();
		const rawResp = await fetch(`${COMPUTE_SERVER}/grasshopper`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body
		});
		const rawText = await rawResp.text();
		ok(`Raw fetch completed (${rawResp.status})`, t5b());

		// Show just the values/InnerTree part from raw response
		try {
			const rawJson = JSON.parse(rawText);
			const keys = Object.keys(rawJson);
			console.error(`  Response keys: ${keys.join(', ')}`);
			console.error(`  dataformat:    ${rawJson.dataformat}`);
			if (rawJson.values) {
				console.error(
					`  values: ${JSON.stringify(rawJson.values, null, 2).split('\n').join('\n  ')}`
				);
			}
			if (rawJson['values-grasshopper']) {
				const ghData = rawJson['values-grasshopper'];
				console.error(`  values-grasshopper: ${JSON.stringify(ghData).slice(0, 200)}`);
			}
		} catch {
			console.error(`  Raw response (first 500 chars): ${rawText.slice(0, 500)}`);
		}

		// ── 6. Raw response ───────────────────────────────────────────────────
		section('6. Raw Response Format (from client)');
		const raw = result as unknown as Record<string, unknown>;
		const rawKeys = Object.keys(raw);
		console.error(`  Top-level keys: ${rawKeys.join(', ')}`);
		console.error(`  modelunits:     ${raw['modelunits']}`);
		console.error(`  dataversion:    ${raw['dataversion']}`);
		console.error(`  dataformat:     ${raw['dataformat']}`);
		console.error(`  cachesolve:     ${raw['cachesolve']}`);

		// Dump every top-level key that isn't algo (base64 blob)
		for (const key of rawKeys) {
			if (key === 'algo') continue;
			const val = raw[key];
			if (Array.isArray(val)) {
				console.error(`\n  [${key}]  (array, ${val.length} entries)`);
				for (let i = 0; i < val.length; i++) {
					console.error(`    [${i}] ${JSON.stringify(val[i], null, 2).split('\n').join('\n    ')}`);
				}
			} else if (val !== null && typeof val === 'object') {
				console.error(`\n  [${key}]  (object)`);
				console.error(`    ${JSON.stringify(val, null, 2).split('\n').join('\n    ')}`);
			} else if (
				!['modelunits', 'dataversion', 'cachesolve', 'filename', 'dataformat'].includes(key)
			) {
				// scalar fields not already printed above
				console.error(`  ${key}: ${val}`);
			}
		}

		if (result.errors?.length) {
			console.warn(`  Errors: ${result.errors.join(', ')}`);
		}
		if (result.warnings?.length) {
			console.warn(`  Warnings: ${result.warnings.join(', ')}`);
		}

		// ── 7. Parsed output values ───────────────────────────────────────────
		section('7. Parsed Output Values');
		const processor = new GrasshopperResponseProcessor(result);
		const { values: parsed } = processor.getValues();

		if (parsed && Object.keys(parsed).length > 0) {
			for (const [key, val] of Object.entries(parsed)) {
				const typeLabel = Array.isArray(val) ? `array[${(val as unknown[]).length}]` : typeof val;
				console.error(`  • ${key}:`);
				console.error(`    type:  ${typeLabel}`);
				console.error(`    value: ${JSON.stringify(val)}`);
			}
		} else {
			warnMsg('No parsed output values returned');
		}

		// ── Summary ───────────────────────────────────────────────────────────
		section('Summary');
		ok(`Total time:    ${totalTimer().toFixed(1)}ms`);
		ok(`Solve time:    ${solveMs.toFixed(1)}ms`);
		ok(`Output params: ${parsed ? Object.keys(parsed).length : 0}`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		section('Error');
		fail(message);
		if (error instanceof Error && error.stack) {
			console.error(error.stack.split('\n').slice(1).join('\n'));
		}
		process.exit(1);
	} finally {
		if (client) {
			await client.dispose();
		}
	}
}

main();
