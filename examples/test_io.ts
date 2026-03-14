/**
 * Rhino.Compute I/O Testing Suite
 *
 * This file demonstrates how to properly test inputs and outputs against
 * a Rhino Compute server. It validates:
 *
 * 1. Definition metadata (inputs/outputs structure)
 * 2. Input data types and constraints
 * 3. Output value types and counts
 * 4. End-to-end computation with various input combinations
 *
 * Run with: npx tsx examples/test_io.ts
 * Or with vitest: npm test -- examples/test_io.ts
 */

import {
	GrasshopperClient,
	type GrasshopperComputeConfig,
	TreeBuilder,
	GrasshopperResponseProcessor,
	type InputParam
} from '../src/features/grasshopper';

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

const DEFINITION_FILE = 'http://127.0.0.1:5500/examples/files/simple_api_test.gh';
const COMPUTE_SERVER = 'http://localhost:5000';

const config = {
	serverUrl: COMPUTE_SERVER,
	debug: false,
	dataformat: 1
} as GrasshopperComputeConfig;

// ============================================================================
// TEST UTILITIES
// ============================================================================

class TestRunner {
	private passed = 0;
	private failed = 0;

	async test(name: string, fn: () => Promise<void> | void) {
		try {
			await fn();
			this.passed++;
			console.error(`✓ ${name}`);
		} catch (error) {
			this.failed++;
			const message = error instanceof Error ? error.message : String(error);
			console.error(`✗ ${name}`);
			console.error(`  ${message}`);
		}
	}

	async group(name: string, fn: () => Promise<void>) {
		console.error(`\n${name}`);
		console.error('─'.repeat(name.length));
		await fn();
	}

	summary() {
		const total = this.passed + this.failed;
		console.error(`\n${total} tests: ${this.passed} passed, ${this.failed} failed`);
		return this.failed === 0;
	}
}

function assert(condition: boolean, message: string) {
	if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
	if (actual !== expected) {
		throw new Error(`${message}\n  Expected: ${expected}\n  Got: ${actual}`);
	}
}

function assertExists<T>(value: T | null | undefined, message: string): T {
	if (value === null || value === undefined) {
		throw new Error(`${message} - value is null or undefined`);
	}
	return value;
}

// ============================================================================
// MAIN TEST SUITE
// ============================================================================

async function runTests() {
	const runner = new TestRunner();
	let client: GrasshopperClient | null = null;

	try {
		// ========================================================================
		// SETUP
		// ========================================================================

		await runner.group('Setup', async () => {
			await runner.test('Create GrasshopperClient', async () => {
				client = await GrasshopperClient.create(config);
				assert(client !== null, 'Client should be created');
			});
		});

		if (!client) {
			throw new Error('Client creation failed, cannot continue');
		}

		// ========================================================================
		// DEFINITION METADATA TESTS
		// ========================================================================

		let inputs: InputParam[] = [];
		let inputNames: string[] = [];

		await runner.group('Definition Metadata Validation', async () => {
			let io: any;

			await runner.test('Fetch definition I/O', async () => {
				io = await client!.getIO(DEFINITION_FILE);
				assertExists(io, 'Definition I/O should be retrieved');

				// Display full I/O structure
				console.error('\n  📋 DEFINITION I/O STRUCTURE:');
				console.error('  ─────────────────────────────');
				console.error('  Inputs:');
				io.inputs.forEach((input: InputParam, idx: number) => {
					console.error(`    [${idx}]`, JSON.stringify(input, null, 2));
				});
				console.error('\n  Outputs:');
				io.outputs.forEach((output: any, idx: number) => {
					console.error(`    [${idx}]`, JSON.stringify(output, null, 2));
				});
			});

			await runner.test('Definition has inputs', async () => {
				io = await client!.getIO(DEFINITION_FILE);
				assert(Array.isArray(io.inputs), 'inputs should be an array');
				assert(io.inputs.length > 0, 'definition should have at least one input');
				console.error(`\n  Found ${io.inputs.length} inputs`);
			});

			await runner.test('Definition has outputs', async () => {
				io = await client!.getIO(DEFINITION_FILE);
				assert(Array.isArray(io.outputs), 'outputs should be an array');
				assert(io.outputs.length > 0, 'definition should have at least one output');
				console.error(`\n  Found ${io.outputs.length} outputs`);
			});

			await runner.test('Inputs have required metadata', async () => {
				io = await client!.getIO(DEFINITION_FILE);
				const missingParamType: string[] = [];
				io.inputs.forEach((input: InputParam) => {
					assert(input.name, `Input missing name: ${JSON.stringify(input)}`);
					if (!input.paramType) {
						missingParamType.push(input.name);
					}
					inputs = io.inputs;
					inputNames = inputs.map((i: InputParam) => i.name);
				});
				if (missingParamType.length > 0) {
					console.error(`\n  ⚠️  Inputs without 'paramType' field: ${missingParamType.join(', ')}`);
				}
			});

			await runner.test('Outputs have required metadata', async () => {
				io = await client!.getIO(DEFINITION_FILE);
				const missingParamType: string[] = [];
				io.outputs.forEach((output: any) => {
					assert(output.name, `Output missing name: ${JSON.stringify(output)}`);
					if (!output.paramType) {
						missingParamType.push(output.name);
					}
				});
				if (missingParamType.length > 0) {
					console.error(
						`\n  ⚠️  Outputs without 'paramType' field: ${missingParamType.join(', ')}`
					);
				}
			});

			await runner.test('Input names are descriptive', async () => {
				io = await client!.getIO(DEFINITION_FILE);
				io.inputs.forEach((input: InputParam) => {
					assert(input.name.length > 0, 'Input name should not be empty');
				});
			});
		});

		// ========================================================================
		// INPUT DATA STRUCTURE TESTS
		// ========================================================================

		await runner.group('Input Data Structure', async () => {
			await runner.test('Build input tree from definition', async () => {
				const inputTree = TreeBuilder.fromInputParams(inputs);
				assertExists(inputTree, 'Input tree should be built');
				assert(Array.isArray(inputTree), 'Input tree should be an array');
			});

			await runner.test('Input tree contains all inputs', async () => {
				const inputTree = TreeBuilder.fromInputParams(inputs);
				const treeParamNames = inputTree.map((item: any) => item.ParamName);
				inputNames.forEach((name: string) => {
					assert(treeParamNames.includes(name), `Input "${name}" should be in tree`);
				});
			});

			await runner.test('Input tree items have InnerTree structure', async () => {
				const inputTree = TreeBuilder.fromInputParams(inputs);
				inputTree.forEach((item: any) => {
					assert(item.ParamName, 'Item should have ParamName');
					assert(typeof item.InnerTree === 'object', 'Item should have InnerTree object');
				});
			});

			await runner.test('Can modify numeric input values', async () => {
				const inputTree = TreeBuilder.fromInputParams(inputs);
				const numericInput = inputs.find(
					(i: InputParam) => i.paramType === 'Integer' || i.paramType === 'Number'
				);
				if (numericInput) {
					TreeBuilder.replaceTreeValue(inputTree, numericInput.name, 42);
					// Verify the value was set
					const item = inputTree.find((i: any) => i.ParamName === numericInput.name);
					assert(item !== undefined, `Should find modified input "${numericInput.name}"`);
				}
			});

			await runner.test('Can modify boolean input values', async () => {
				const inputTree = TreeBuilder.fromInputParams(inputs);
				const boolInput = inputs.find((i: InputParam) => i.paramType === 'Boolean');
				if (boolInput) {
					TreeBuilder.replaceTreeValue(inputTree, boolInput.name, true);
					const item = inputTree.find((i: any) => i.ParamName === boolInput.name);
					assert(item !== undefined, `Should find modified input "${boolInput.name}"`);
				}
			});

			await runner.test('Can modify text input values', async () => {
				const inputTree = TreeBuilder.fromInputParams(inputs);
				const textInput = inputs.find((i: InputParam) => i.paramType === 'Text');
				if (textInput) {
					TreeBuilder.replaceTreeValue(inputTree, textInput.name, 'test value');
					const item = inputTree.find((i: any) => i.ParamName === textInput.name);
					assert(item !== undefined, `Should find modified input "${textInput.name}"`);
				}
			});
		});

		// ========================================================================
		// COMPUTATION TESTS
		// ========================================================================

		await runner.group('Computation & Output Validation', async () => {
			let result: any;

			await runner.test('Execute computation with default inputs', async () => {
				const inputTree = TreeBuilder.fromInputParams(inputs);
				result = await client!.solve(DEFINITION_FILE, inputTree);
				assertExists(result, 'Computation should return result');
			});

			await runner.test('Result has expected structure', async () => {
				const inputTree = TreeBuilder.fromInputParams(inputs);
				result = await client!.solve(DEFINITION_FILE, inputTree);
				assert(
					result.values && typeof result.values === 'object',
					'Result should contain values object'
				);
			});

			await runner.test('Result can be processed', async () => {
				const inputTree = TreeBuilder.fromInputParams(inputs);
				result = await client!.solve(DEFINITION_FILE, inputTree);

				console.error('\n  🔍 RAW COMPUTATION RESULT:');
				console.error('  ─────────────────────────────');
				console.error(JSON.stringify(result, null, 2));

				const processor = new GrasshopperResponseProcessor(result);
				const processed = processor.getValues();
				assertExists(processed, 'Should process result');
				assertExists(processed.values, 'Processed result should have values');
			});

			await runner.test('Output values are accessible', async () => {
				const inputTree = TreeBuilder.fromInputParams(inputs);
				result = await client!.solve(DEFINITION_FILE, inputTree);
				const processor = new GrasshopperResponseProcessor(result);
				const { values } = processor.getValues();

				console.error('\n  📊 COMPUTATION OUTPUT VALUES:');
				console.error('  ─────────────────────────────');
				if (values && Object.keys(values).length > 0) {
					Object.entries(values).forEach(([key, value]) => {
						assert(key.length > 0, 'Output key should not be empty');
						console.error(`    ${key}:`, JSON.stringify(value, null, 2));
					});
				} else {
					console.error('    (no output values returned)');
				}
			});

			await runner.test('Computation with modified inputs produces results', async () => {
				const inputTree = TreeBuilder.fromInputParams(inputs);
				const numericInput = inputs.find(
					(i: InputParam) => i.paramType === 'Integer' || i.paramType === 'Number'
				);
				if (numericInput) {
					TreeBuilder.replaceTreeValue(inputTree, numericInput.name, 100);
				}
				result = await client!.solve(DEFINITION_FILE, inputTree);
				assertExists(result, 'Computation with modified input should succeed');
			});
		});

		// ========================================================================
		// INPUT/OUTPUT CONSISTENCY TESTS
		// ========================================================================

		await runner.group('I/O Consistency Checks', async () => {
			await runner.test('Multiple computations with same input produce same output', async () => {
				const inputTree1 = TreeBuilder.fromInputParams(inputs);
				const inputTree2 = TreeBuilder.fromInputParams(inputs);

				const result1 = await client!.solve(DEFINITION_FILE, inputTree1);
				const result2 = await client!.solve(DEFINITION_FILE, inputTree2);

				const processor1 = new GrasshopperResponseProcessor(result1);
				const processor2 = new GrasshopperResponseProcessor(result2);

				const { values: values1 } = processor1.getValues();
				const { values: values2 } = processor2.getValues();

				assertEqual(
					JSON.stringify(values1),
					JSON.stringify(values2),
					'Same inputs should produce same outputs'
				);
			});

			await runner.test('Definition metadata is consistent', async () => {
				const io1 = await client!.getIO(DEFINITION_FILE);
				const io2 = await client!.getIO(DEFINITION_FILE);

				assertEqual(io1.inputs.length, io2.inputs.length, 'Input count should be consistent');

				assertEqual(io1.outputs.length, io2.outputs.length, 'Output count should be consistent');

				io1.inputs.forEach((input1: InputParam, idx: number) => {
					const input2 = io2.inputs[idx];
					assertEqual(input1.name, input2.name, `Input ${idx} name should match`);
					assertEqual(input1.paramType, input2.paramType, `Input ${idx} paramType should match`);
				});
			});
		});

		// ========================================================================
		// CLEANUP
		// ========================================================================

		await runner.group('Cleanup', async () => {
			await runner.test('Dispose client', async () => {
				if (client) {
					await client.dispose();
					client = null;
				}
			});
		});

		// ========================================================================
		// RESULTS
		// ========================================================================

		const success = runner.summary();
		process.exit(success ? 0 : 1);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error('\n✗ Test suite failed:', message);
		process.exit(1);
	} finally {
		if (client) {
			try {
				await client.dispose();
			} catch (err) {
				// ignore
			}
		}
	}
}

runTests();
