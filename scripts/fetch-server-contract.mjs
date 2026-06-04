/**
 * Fetches the Rhino Compute server's JSON-contract source files from
 * VektorNode/compute.rhino3d (branch `Compute8`) and writes a parsed snapshot
 * to tests/contract/server-contract.snapshot.json.
 *
 * Two modes:
 *   node scripts/fetch-server-contract.mjs          # write/refresh the snapshot
 *   node scripts/fetch-server-contract.mjs --check   # fail if GitHub differs
 *                                                     # from the committed snapshot
 *
 * `--check` is the live drift alarm: run it in CI (and/or on a schedule) so a
 * rename/recasing on the server branch fails loudly instead of silently
 * breaking the client at runtime. It does NOT modify the snapshot.
 *
 * The actual parsing lives in tests/contract/parse-server-contract.mjs and is
 * imported directly here, so the script and the tests share one parser (no
 * drift between "how the snapshot was made" and "what the tests assert").
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { parseServerContract } from '../tests/contract/parse-server-contract.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SNAPSHOT_PATH = resolve(REPO_ROOT, 'tests/contract/server-contract.snapshot.json');

export const SERVER_REPO = 'VektorNode/compute.rhino3d';

/** The committed source-of-truth branch. */
export const DEFAULT_SERVER_REF = 'Compute8';

/**
 * Resolve which server branch to read. Precedence: `--ref=<branch>` CLI flag,
 * then the `SERVER_CONTRACT_REF` env var, then the committed default. Lets you
 * point the snapshot/check at any branch (e.g. merge/8x) without editing files:
 *   SERVER_CONTRACT_REF=merge/8x pnpm contract:check
 *   node scripts/fetch-server-contract.mjs --check --ref=merge/8x
 */
export function resolveRef(argv = process.argv) {
	const flag = argv.find((a) => a.startsWith('--ref='));
	if (flag) return flag.slice('--ref='.length);
	return process.env.SERVER_CONTRACT_REF || DEFAULT_SERVER_REF;
}

const SERVER_REF = resolveRef();
const RAW_BASE = `https://raw.githubusercontent.com/${SERVER_REPO}/${SERVER_REF}`;

/** Files we pull, relative to the server repo root. */
const SOURCES = {
	schemaCs: 'src/compute.geometry/IO/Schema.cs',
	ghPathCs: 'src/compute.geometry/IO/GhPath.cs'
};

async function fetchSource(path) {
	const url = `${RAW_BASE}/${path}`;
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`Failed to fetch ${url}: HTTP ${res.status} ${res.statusText}`);
	}
	return res.text();
}

/** Build the contract object from live GitHub source. */
async function buildLiveContract() {
	const [schemaCs, ghPathCs] = await Promise.all([
		fetchSource(SOURCES.schemaCs),
		fetchSource(SOURCES.ghPathCs)
	]);
	return parseServerContract(schemaCs, ghPathCs, SERVER_REF);
}

/** Stable, diff-friendly JSON (tab-indented, trailing newline) for writing. */
function serialize(contract) {
	return JSON.stringify(contract, null, '\t') + '\n';
}

/**
 * Whitespace-independent canonical form for semantic comparison. Sorts object
 * keys (so key order can't cause a false drift) but preserves ARRAY order —
 * property lists are ordered by C# source position and that order is part of
 * the contract we pin.
 */
function canonical(value) {
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
	if (value && typeof value === 'object') {
		const keys = Object.keys(value).sort();
		return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
	}
	return JSON.stringify(value);
}

/** Canonical form of just the contract fields (the `classes`), ignoring `ref`. */
function canonicalClasses(contract) {
	return canonical(contract.classes ?? {});
}

async function main() {
	const check = process.argv.includes('--check');
	const live = await buildLiveContract();
	const liveJson = serialize(live);

	if (check) {
		let committedRaw;
		try {
			committedRaw = readFileSync(SNAPSHOT_PATH, 'utf8');
		} catch {
			console.error(
				`❌ No committed snapshot at ${SNAPSHOT_PATH}. Run \`pnpm contract:snapshot\` first.`
			);
			process.exit(1);
		}

		// Compare SEMANTICALLY (parsed), not byte-for-byte. The committed file may
		// be reformatted by a formatter or have different whitespace/EOL without
		// the contract having changed — that must not trip the drift alarm. Only a
		// real field rename/recasing/add/remove should fail.
		//
		// We compare CONTRACT FIELDS only (`classes`), not `ref`. That lets you
		// point `--check` at a different branch (e.g. --ref=merge/8x) to ask "does
		// this branch's wire contract still match what the client expects?" without
		// the branch-name difference itself counting as drift. A ref mismatch is
		// reported as info, below.
		const committed = JSON.parse(committedRaw);
		const before = canonicalClasses(committed);
		const after = canonicalClasses(live);

		const checkingOtherRef = committed.ref !== SERVER_REF;

		if (before !== after) {
			console.error(
				'❌ Server contract drift detected.\n\n' +
					`The wire contract on ${SERVER_REPO}@${SERVER_REF} differs from the committed\n` +
					`snapshot (${SERVER_REPO}@${committed.ref}). This means the Rhino Compute server\n` +
					`changed a field name or casing the client depends on. Review the diff, update\n` +
					`the client if needed, then run \`pnpm contract:snapshot\` to accept the new contract.\n`
			);
			// Show a compact diff of class property sets.
			for (const name of new Set([
				...Object.keys(committed.classes ?? {}),
				...Object.keys(live.classes ?? {})
			])) {
				const b = committed.classes?.[name]?.properties ?? null;
				const a = live.classes?.[name]?.properties ?? null;
				if (JSON.stringify(b) !== JSON.stringify(a)) {
					console.error(`  ${name}:`);
					console.error(`    committed (${committed.ref}): ${JSON.stringify(b)}`);
					console.error(`    live      (${SERVER_REF}): ${JSON.stringify(a)}`);
				}
			}
			process.exit(1);
		}

		if (checkingOtherRef) {
			console.log(
				`✅ ${SERVER_REPO}@${SERVER_REF} matches the committed snapshot's contract ` +
					`(snapshot ref: ${committed.ref}). Fields identical; only the branch differs.`
			);
		} else {
			console.log(`✅ Server contract matches committed snapshot (${SERVER_REPO}@${SERVER_REF}).`);
		}
		return;
	}

	writeFileSync(SNAPSHOT_PATH, liveJson);
	console.log(`✅ Wrote server contract snapshot from ${SERVER_REPO}@${SERVER_REF}`);
	console.log(`   → ${SNAPSHOT_PATH}`);
}

// Only run as a CLI — importing this module (e.g. from a test, to reuse
// resolveRef) must NOT trigger a network fetch.
const invokedDirectly =
	process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	main().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
