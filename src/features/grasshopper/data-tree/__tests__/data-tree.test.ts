import { describe, expect, it } from 'vitest';
import { TreeBuilder } from '../data-tree';
import type { DataTree, InputParam } from '../../types';

/**
 * Characterization tests for TreeBuilder. These pin real-world behavior so a
 * future refactor (#20 in IMPROVEMENTS.md — collapse the duplicate
 * `TreeBuilder[]` vs `DataTree[]` paths) doesn't silently change semantics.
 *
 * Scenarios mirror the README examples and the way the library is actually
 * used end-to-end: `getIO` -> `fromInputParams` -> `solve` -> `getTreeValue`,
 * with `replaceTreeValue` patches in between for slider-style updates.
 */

// ---------------------------------------------------------------------------
// Helpers — build the InputParam shapes that fetchParsedDefinitionIO produces
// ---------------------------------------------------------------------------

function numericInput(name: string, def: number, opts: Partial<InputParam> = {}): InputParam {
	return {
		name,
		nickname: name,
		description: '',
		groupName: '',
		id: `${name}-id`,
		treeAccess: false,
		paramType: 'Number',
		minimum: undefined,
		maximum: undefined,
		atLeast: 1,
		atMost: 1,
		default: def,
		...opts
	} as InputParam;
}

function textInput(name: string, def: string): InputParam {
	return {
		name,
		nickname: name,
		description: '',
		groupName: '',
		id: `${name}-id`,
		treeAccess: false,
		paramType: 'Text',
		default: def
	} as InputParam;
}

// ---------------------------------------------------------------------------

describe('TreeBuilder — basic building (README scenarios)', () => {
	it('builds a flat tree at path [0]', () => {
		const tree = new TreeBuilder('MyParam').appendFlat([1, 2, 3, 4, 5]).toComputeFormat();

		expect(tree.ParamName).toBe('MyParam');
		expect(tree.InnerTree).toEqual({
			'{0}': [{ data: 1 }, { data: 2 }, { data: 3 }, { data: 4 }, { data: 5 }]
		});
	});

	it('builds a multi-branch tree with nested paths', () => {
		const tree = new TreeBuilder('Points')
			.append([0], [{ x: 0, y: 0, z: 0 }])
			.append([0, 1], [{ x: 1, y: 1, z: 1 }])
			.append([1], [{ x: 2, y: 2, z: 2 }])
			.toComputeFormat();

		expect(Object.keys(tree.InnerTree)).toEqual(['{0}', '{0;1}', '{1}']);
		// Object values are JSON-stringified by serializeValue
		expect((tree.InnerTree as any)['{0}']).toEqual([{ data: '{"x":0,"y":0,"z":0}' }]);
	});

	it('preserves booleans and numbers as primitives (Grasshopper depends on this)', () => {
		const tree = new TreeBuilder('Mixed').appendFlat([true, 42, 'hello']).toComputeFormat();
		const items = (tree.InnerTree as any)['{0}'];
		expect(items[0].data).toBe(true);
		expect(items[1].data).toBe(42);
		expect(items[2].data).toBe('hello');
	});

	it('appendFlat with a single (non-array) value still wraps to path [0]', () => {
		const tree = new TreeBuilder('Single').appendFlat(7).toComputeFormat();
		expect(tree.InnerTree).toEqual({ '{0}': [{ data: 7 }] });
	});

	it('fromDataTreeDefault loads an existing branch structure', () => {
		const tree = new TreeBuilder('Values').fromDataTreeDefault({
			'{0}': [1, 2, 3],
			'{0;0}': [4, 5],
			'{1}': [6, 7, 8]
		});

		expect(tree.getPaths()).toEqual(['{0}', '{0;0}', '{1}']);
		expect(tree.getPath([0, 0])).toEqual([4, 5]);
		expect(tree.flatten()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
	});
});

describe('TreeBuilder.fromInputParams — definition IO -> trees', () => {
	it('skips inputs whose default is undefined/null/empty', () => {
		const inputs: InputParam[] = [
			numericInput('keep', 5),
			{ ...numericInput('drop1', 0), default: undefined } as InputParam,
			{ ...numericInput('drop2', 0), default: null } as InputParam,
			{ ...numericInput('drop3', 0), default: [] as any } as InputParam
		];

		const trees = TreeBuilder.fromInputParams(inputs);
		expect(trees).toHaveLength(1);
		expect(trees[0].ParamName).toBe('keep');
	});

	it('clamps numeric defaults to min/max constraints', () => {
		const inputs: InputParam[] = [
			numericInput('over', 200, { minimum: 0, maximum: 100 }),
			numericInput('under', -5, { minimum: 0, maximum: 100 }),
			numericInput('inside', 50, { minimum: 0, maximum: 100 })
		];

		const trees = TreeBuilder.fromInputParams(inputs);
		expect((trees[0].InnerTree as any)['{0}'][0].data).toBe(100);
		expect((trees[1].InnerTree as any)['{0}'][0].data).toBe(0);
		expect((trees[2].InnerTree as any)['{0}'][0].data).toBe(50);
	});

	it('keeps text values as-is (no clamping)', () => {
		const trees = TreeBuilder.fromInputParams([textInput('label', 'hello')]);
		expect((trees[0].InnerTree as any)['{0}'][0].data).toBe('hello');
	});

	it('expands tree-access inputs whose default is a DataTreeDefault', () => {
		const input: InputParam = {
			...numericInput('grid', 0),
			treeAccess: true,
			default: {
				'{0}': [1, 2],
				'{1}': [3, 4]
			} as any
		};

		const trees = TreeBuilder.fromInputParams([input]);
		expect(Object.keys(trees[0].InnerTree)).toEqual(['{0}', '{1}']);
		expect((trees[0].InnerTree as any)['{0}']).toEqual([{ data: 1 }, { data: 2 }]);
	});
});

// ---------------------------------------------------------------------------
// replaceTreeValue — both forms used in real flows
// ---------------------------------------------------------------------------

describe('TreeBuilder.replaceTreeValue — TreeBuilder[] form (pre-solve)', () => {
	it('replaces an existing parameter in-place', () => {
		const trees = [new TreeBuilder('X').appendFlat(1), new TreeBuilder('Y').appendFlat(2)];

		const updated = TreeBuilder.replaceTreeValue(trees, 'X', 42);

		expect(updated).toHaveLength(2);
		expect(updated[0].getParamName()).toBe('X');
		expect(updated[0].flatten()).toEqual([42]);
		// Y untouched
		expect(updated[1].flatten()).toEqual([2]);
	});

	it('appends a new TreeBuilder when paramName not found', () => {
		const trees = [new TreeBuilder('X').appendFlat(1)];

		const updated = TreeBuilder.replaceTreeValue(trees, 'Y', [10, 20]);

		expect(updated).toHaveLength(2);
		expect(updated[1].getParamName()).toBe('Y');
		expect(updated[1].flatten()).toEqual([10, 20]);
	});

	it('handles a DataTreeDefault structure as newValue (with a non-empty TreeBuilder[])', () => {
		// Must seed with a TreeBuilder so trees[0] instanceof TreeBuilder is true
		// — the empty-array case falls into the DataTree[] branch (see audit edge case below).
		const trees: TreeBuilder[] = [new TreeBuilder('placeholder')];
		const updated = TreeBuilder.replaceTreeValue(trees, 'Grid', {
			'{0}': [1, 2],
			'{1}': [3]
		} as any);

		const grid = updated.find((t) => t.getParamName() === 'Grid')!;
		expect(grid.getPaths()).toEqual(['{0}', '{1}']);
		expect(grid.getPath([0])).toEqual([1, 2]);
		expect(grid.getPath([1])).toEqual([3]);
	});
});

describe('TreeBuilder.replaceTreeValue — DataTree[] form (post-solve / API format)', () => {
	it('replaces an existing parameter in compiled InnerTree array', () => {
		const trees: DataTree[] = [
			{ ParamName: 'X', InnerTree: { '{0}': [{ data: 1 }] } as any },
			{ ParamName: 'Y', InnerTree: { '{0}': [{ data: 2 }] } as any }
		];

		const updated = TreeBuilder.replaceTreeValue(trees, 'X', 42);

		expect(updated).toHaveLength(2);
		expect(updated[0].ParamName).toBe('X');
		expect((updated[0].InnerTree as any)['{0}']).toEqual([{ data: 42 }]);
		// Y untouched
		expect((updated[1].InnerTree as any)['{0}']).toEqual([{ data: 2 }]);
	});

	it('appends a new DataTree when paramName not found', () => {
		const trees: DataTree[] = [{ ParamName: 'X', InnerTree: { '{0}': [{ data: 1 }] } as any }];

		const updated = TreeBuilder.replaceTreeValue(trees, 'Y', [10, 20]);

		expect(updated).toHaveLength(2);
		expect(updated[1].ParamName).toBe('Y');
		expect((updated[1].InnerTree as any)['{0}']).toEqual([{ data: 10 }, { data: 20 }]);
	});
});

describe('TreeBuilder.replaceTreeValue — empty array (the audit edge case)', () => {
	it('TreeBuilder[] starting empty: trees[0] is undefined, falls into DataTree[] branch', () => {
		// This pins the existing behavior. The audit calls out that the
		// `trees[0] instanceof TreeBuilder` check on an empty array picks the
		// DataTree[] branch — and since DataTree.findIndex returns -1, the
		// new entry is pushed. We verify the *resulting shape* matches the
		// DataTree format (because that's the branch taken).
		const trees: TreeBuilder[] = [];
		// The static signature returns TreeBuilder[] for this overload, but the
		// runtime branch picked is the DataTree[] one (since trees[0] is
		// undefined). Cast through `unknown` to assert against the actual shape.
		const updated = TreeBuilder.replaceTreeValue(trees, 'New', 5) as unknown as DataTree[];

		expect(updated).toHaveLength(1);
		// When the empty-array branch picks DataTree path, the entry has the
		// compute-format shape (ParamName + InnerTree), NOT a TreeBuilder.
		expect(updated[0]).toHaveProperty('ParamName', 'New');
		expect(updated[0]).toHaveProperty('InnerTree');
	});

	it('DataTree[] starting empty also works', () => {
		const trees: DataTree[] = [];
		const updated = TreeBuilder.replaceTreeValue(trees, 'New', 5);

		expect(updated).toHaveLength(1);
		expect(updated[0].ParamName).toBe('New');
		expect((updated[0].InnerTree as any)['{0}']).toEqual([{ data: 5 }]);
	});
});

// ---------------------------------------------------------------------------
// getTreeValue — both forms
// ---------------------------------------------------------------------------

describe('TreeBuilder.getTreeValue — TreeBuilder[] form', () => {
	it('unwraps a single value', () => {
		const trees = [new TreeBuilder('X').appendFlat(42)];
		expect(TreeBuilder.getTreeValue(trees, 'X')).toBe(42);
	});

	it('returns array for multiple values', () => {
		const trees = [new TreeBuilder('Pts').appendFlat([1, 2, 3])];
		expect(TreeBuilder.getTreeValue(trees, 'Pts')).toEqual([1, 2, 3]);
	});

	it('returns null when paramName missing', () => {
		const trees = [new TreeBuilder('X').appendFlat(1)];
		expect(TreeBuilder.getTreeValue(trees, 'Missing')).toBeNull();
	});

	it('returns null when the matched tree is empty', () => {
		const trees = [new TreeBuilder('Empty')];
		expect(TreeBuilder.getTreeValue(trees, 'Empty')).toBeNull();
	});
});

describe('TreeBuilder.getTreeValue — DataTree[] form (API responses)', () => {
	it('unwraps a single value from InnerTree response', () => {
		const trees: DataTree[] = [{ ParamName: 'X', InnerTree: { '{0}': [{ data: 42 }] } as any }];
		expect(TreeBuilder.getTreeValue(trees, 'X')).toBe(42);
	});

	it('returns array for multiple values, deserializing each', () => {
		const trees: DataTree[] = [
			{
				ParamName: 'Pts',
				InnerTree: { '{0}': [{ data: '1' }, { data: '2' }, { data: '3' }] } as any
			}
		];
		expect(TreeBuilder.getTreeValue(trees, 'Pts')).toEqual([1, 2, 3]);
	});

	it('returns null when paramName missing', () => {
		const trees: DataTree[] = [{ ParamName: 'X', InnerTree: { '{0}': [{ data: 1 }] } as any }];
		expect(TreeBuilder.getTreeValue(trees, 'Missing')).toBeNull();
	});

	it('reads from the first branch path only (current semantics)', () => {
		// `{1}` is ignored — getTreeValue uses Object.keys(...)[0]
		const trees: DataTree[] = [
			{
				ParamName: 'X',
				InnerTree: {
					'{0}': [{ data: 100 }],
					'{1}': [{ data: 200 }]
				} as any
			}
		];
		expect(TreeBuilder.getTreeValue(trees, 'X')).toBe(100);
	});

	it('deserializes JSON-encoded objects', () => {
		const trees: DataTree[] = [
			{ ParamName: 'P', InnerTree: { '{0}': [{ data: '{"x":1,"y":2}' }] } as any }
		];
		expect(TreeBuilder.getTreeValue(trees, 'P')).toEqual({ x: 1, y: 2 });
	});

	it('returns null when InnerTree has no branches', () => {
		const trees: DataTree[] = [{ ParamName: 'Empty', InnerTree: {} as any }];
		expect(TreeBuilder.getTreeValue(trees, 'Empty')).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// End-to-end: the slider scrub flow
// ---------------------------------------------------------------------------

describe('TreeBuilder — slider scrub end-to-end flow', () => {
	it('build trees from inputs, override one value, read it back', () => {
		const inputs: InputParam[] = [
			numericInput('radius', 10, { minimum: 0, maximum: 100 }),
			numericInput('height', 20, { minimum: 0, maximum: 50 })
		];

		const trees = TreeBuilder.fromInputParams(inputs);
		expect(trees).toHaveLength(2);

		// Simulate slider moving radius to 75
		const updated = TreeBuilder.replaceTreeValue(trees, 'radius', 75);

		expect(TreeBuilder.getTreeValue(updated, 'radius')).toBe(75);
		expect(TreeBuilder.getTreeValue(updated, 'height')).toBe(20);
	});
});

// ---------------------------------------------------------------------------
// Path string round-trip
// ---------------------------------------------------------------------------

describe('TreeBuilder — path string parsing', () => {
	it('round-trips simple and nested paths', () => {
		expect(TreeBuilder.formatPathString([0])).toBe('{0}');
		expect(TreeBuilder.formatPathString([0, 1, 2])).toBe('{0;1;2}');
		expect(TreeBuilder.parsePathString('{0}')).toEqual([0]);
		expect(TreeBuilder.parsePathString('{0;1;2}')).toEqual([0, 1, 2]);
	});

	it('treats the root path "{}" as []', () => {
		expect(TreeBuilder.parsePathString('{}')).toEqual([]);
	});

	it('falls back to [0] on malformed paths', () => {
		expect(TreeBuilder.parsePathString('garbage')).toEqual([0]);
		expect(TreeBuilder.parsePathString('{abc}')).toEqual([0]);
	});
});
