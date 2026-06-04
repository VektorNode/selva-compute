/**
 * Parses the Rhino Compute server's JSON contract straight out of its C# source.
 *
 * The source of truth lives in VektorNode/compute.rhino3d on the `Compute8`
 * branch. This module turns two of its files into a small, comparable
 * description of the wire contract:
 *
 *   - `Schema.cs`  — the solve request/response envelope (`Schema`), the IO
 *                    response (`IoResponseSchema` / `InputParamSchema` /
 *                    `IoParamSchema`), and the per-value object
 *                    (`ResthopperObject`). Every serialized member is declared
 *                    with `[JsonProperty("name")]`, so the wire name and its
 *                    casing are right there in the attribute.
 *   - `GhPath.cs`  — `DataTree<T>`, whose `ParamName` / `InnerTree` members have
 *                    NO `[JsonProperty]`. The server serializes them with
 *                    `GeometryResolver` (a DefaultContractResolver with no naming
 *                    strategy), so they go on the wire as bare PascalCase.
 *
 * We extract exactly what the TypeScript client depends on — the set of wire
 * property names and their casing — and nothing about C# types or geometry.
 * That keeps the snapshot stable against unrelated server refactors while still
 * catching the thing that actually breaks the client: a renamed or re-cased
 * field.
 *
 * Plain ESM + pure string parsing on purpose: no C# toolchain and no TS loader,
 * so the same module runs under both vitest and a bare `node scripts/...` call.
 * The `.ts` sibling re-exports this with type annotations for the test files.
 *
 * @typedef {Object} ParsedClass
 * @property {string} name            C# class name, e.g. `InputParamSchema`.
 * @property {string|null} base       Base class name (`class A : B`) or null.
 * @property {string[]} properties    Wire property names declared directly on
 *                                     this class (not inherited), in source order.
 *
 * @typedef {Object} ServerContract
 * @property {string} ref                         git ref the source came from.
 * @property {Record<string, ParsedClass>} classes  relevant classes by C# name.
 */

/**
 * Extract `[JsonProperty("name")]`-decorated members from a C# class body.
 * @param {string} classBody
 * @returns {string[]}
 */
function extractJsonProperties(classBody) {
	const names = [];
	const re =
		/\[JsonProperty\(\s*(?:PropertyName\s*=\s*)?"([^"]+)"[^)]*\)\]\s*(?:\[[^\]]*\]\s*)*public\b/g;
	let m;
	while ((m = re.exec(classBody)) !== null) {
		names.push(m[1]);
	}
	return names;
}

/**
 * Extract serialized members that have NO `[JsonProperty]` — for `DataTree<T>`,
 * whose `ParamName` / `InnerTree` go on the wire as bare PascalCase.
 * @param {string} classBody
 * @param {string[]} wanted
 * @returns {string[]}
 */
function extractBarePublicProperties(classBody, wanted) {
	const found = [];
	for (const name of wanted) {
		const re = new RegExp(`public\\s+[^=;{}()]+\\b${name}\\s*\\{`);
		if (re.test(classBody)) found.push(name);
	}
	return found;
}

/**
 * Remove `//` and block comments so commented-out members don't get parsed.
 * @param {string} src
 * @returns {string}
 */
function stripComments(src) {
	return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/**
 * Find a class body by name, brace-counting so nested braces don't end it early.
 * @param {string} src
 * @param {string} className
 * @returns {{ body: string, base: string|null }|null}
 */
function extractClassBody(src, className) {
	const header = new RegExp(`\\bclass\\s+${className}\\b\\s*(?::\\s*([A-Za-z0-9_<>]+))?[^{]*\\{`);
	const m = header.exec(src);
	if (!m) return null;
	const base = m[1] ?? null;
	const open = m.index + m[0].length - 1;
	let depth = 0;
	for (let i = open; i < src.length; i++) {
		const c = src[i];
		if (c === '{') depth++;
		else if (c === '}') {
			depth--;
			if (depth === 0) return { body: src.slice(open + 1, i), base };
		}
	}
	return null;
}

/** Classes whose members come from `[JsonProperty]` attributes. */
const ATTRIBUTE_CLASSES = [
	'Schema',
	'IoResponseSchema',
	'InputParamSchema',
	'IoParamSchema',
	'ResthopperObject'
];

/** DataTree<T> members the client reads, serialized without [JsonProperty]. */
const DATATREE_WANTED = ['ParamName', 'InnerTree'];

/**
 * Parse the two C# source files into a ServerContract.
 * @param {string} schemaCs   contents of `IO/Schema.cs`
 * @param {string} ghPathCs   contents of `IO/GhPath.cs`
 * @param {string} ref        git ref the sources came from
 * @returns {ServerContract}
 */
export function parseServerContract(schemaCs, ghPathCs, ref) {
	const schemaSrc = stripComments(schemaCs);
	const ghPathSrc = stripComments(ghPathCs);

	/** @type {Record<string, ParsedClass>} */
	const classes = {};

	for (const className of ATTRIBUTE_CLASSES) {
		const found = extractClassBody(schemaSrc, className);
		if (!found) {
			throw new Error(
				`parseServerContract: class '${className}' not found in Schema.cs — the server contract may have been restructured.`
			);
		}
		classes[className] = {
			name: className,
			base: found.base,
			properties: extractJsonProperties(found.body)
		};
	}

	const dataTree = extractClassBody(ghPathSrc, 'DataTree');
	if (!dataTree) {
		throw new Error("parseServerContract: class 'DataTree' not found in GhPath.cs.");
	}
	classes['DataTree'] = {
		name: 'DataTree',
		base: dataTree.base,
		properties: extractBarePublicProperties(dataTree.body, DATATREE_WANTED)
	};

	return { ref, classes };
}

/**
 * Resolve a class's full wire property set including inherited members.
 * Base members come first, in base-to-derived order.
 * @param {ServerContract} contract
 * @param {string} className
 * @returns {string[]}
 */
export function flatten(contract, className) {
	const cls = contract.classes[className];
	if (!cls) throw new Error(`flatten: unknown class '${className}'`);
	const inherited = cls.base && contract.classes[cls.base] ? flatten(contract, cls.base) : [];
	return [...inherited, ...cls.properties];
}
