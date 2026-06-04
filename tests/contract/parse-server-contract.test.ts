/**
 * Unit tests for the C#-source contract parser. The whole seam-test scheme
 * trusts this parser, so it gets its own pins: attribute extraction, inheritance
 * capture, comment stripping, and the bare-property (DataTree) path.
 */
import { describe, expect, it } from 'vitest';

import { flatten, parseServerContract } from './parse-server-contract';

const SCHEMA_CS = `
using Newtonsoft.Json;
namespace Resthopper.IO
{
    public class Schema
    {
        [JsonProperty("modelUnits")]
        public string ModelUnits { get; set; }

        [JsonProperty("cacheSolve")]
        public bool CacheSolve { get; set; } = false;

        // [JsonProperty("ghost")] commented out — must be ignored
        public string NotSerialized { get; set; }
    }

    public class IoParamSchema
    {
        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("paramType")]
        public string ParamType { get; set; }

        [JsonProperty("id")]
        public string Id { get; set; }
    }

    public class InputParamSchema : IoParamSchema
    {
        [JsonProperty("groupName")]
        public string GroupName { get; set; }
    }

    public class IoResponseSchema
    {
        [JsonProperty("inputs")]
        public object Inputs { get; set; }
        [JsonProperty("outputs")]
        public object Outputs { get; set; }
    }

    public class ResthopperObject : IEquatable<ResthopperObject>
    {
        [JsonProperty("type")]
        public string Type { get; set; }

        [JsonProperty(PropertyName = "id")]
        public Guid Id { get; set; }

        [JsonProperty("data")]
        public string Data { get; set; }

        [JsonIgnore]
        public object ResolvedData { get; set; }
    }
}`;

const GHPATH_CS = `
namespace Resthopper.IO
{
    public class DataTree<T>
    {
        public string ParamName { get; set; }
        public Dictionary<string, List<T>> InnerTree {
            get { return tree; }
            set { tree = value; }
        }
        public List<T> this[string key] { get { return tree[key]; } }
    }
}`;

describe('parseServerContract', () => {
	const contract = parseServerContract(SCHEMA_CS, GHPATH_CS, 'TestRef');

	it('records the ref', () => {
		expect(contract.ref).toBe('TestRef');
	});

	it('extracts JsonProperty names in source order', () => {
		expect(contract.classes.Schema.properties).toEqual(['modelUnits', 'cacheSolve']);
	});

	it('ignores commented-out attributes and non-serialized members', () => {
		expect(contract.classes.Schema.properties).not.toContain('ghost');
		expect(contract.classes.Schema.properties).not.toContain('NotSerialized');
	});

	it('handles PropertyName = "..." form', () => {
		expect(contract.classes.ResthopperObject.properties).toContain('id');
	});

	it('skips [JsonIgnore] members', () => {
		expect(contract.classes.ResthopperObject.properties).not.toContain('ResolvedData');
	});

	it('captures the base class for inheritance', () => {
		expect(contract.classes.InputParamSchema.base).toBe('IoParamSchema');
	});

	it('does not treat IEquatable<T> base as a contract class for flattening', () => {
		// ResthopperObject : IEquatable — base is recorded but unknown, so flatten
		// just returns its own props.
		expect(flatten(contract, 'ResthopperObject')).toEqual(['type', 'id', 'data']);
	});

	it('extracts bare PascalCase DataTree members (no JsonProperty)', () => {
		expect(contract.classes.DataTree.properties).toEqual(['ParamName', 'InnerTree']);
	});

	it('does not pick up the DataTree indexer as a property', () => {
		expect(contract.classes.DataTree.properties).not.toContain('this');
	});

	it('throws a clear error if a required class is missing', () => {
		expect(() => parseServerContract('namespace X {}', GHPATH_CS, 'r')).toThrow(
			/Schema.*not found/
		);
	});
});

describe('flatten', () => {
	const contract = parseServerContract(SCHEMA_CS, GHPATH_CS, 'TestRef');

	it('merges inherited base members before derived ones', () => {
		expect(flatten(contract, 'InputParamSchema')).toEqual(['name', 'paramType', 'id', 'groupName']);
	});
});
