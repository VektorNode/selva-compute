import {
	GrasshopperClient,
	type GrasshopperComputeConfig,
	TreeBuilder,
	GrasshopperResponseProcessor
} from '../src/features/grasshopper';

/**
 * Simple example demonstrating how to use GrasshopperClient
 *
 * This example shows the basic workflow:
 * 1. Create a client connected to a Rhino Compute server
 * 2. Inspect definition inputs/outputs using getIO()
 * 3. Build input data using TreeBuilder
 * 4. Run computation with solve()
 * 5. Process results using GrasshopperResponseProcessor
 * 6. Clean up resources
 *
 * Prerequisites:
 * - An active Rhino Compute instance running (default: http://localhost:5000)
 * - Live Server for VSCode running to serve the Grasshopper definition file (http://127.0.0.1:5500)
 * - A Grasshopper definition file (.gh)
 * - (Optional) An API key if your server requires authentication
 *
 * How to run:
 * npx tsx examples/simple_example.ts
 *
 * Troubleshooting:
 * - If connection fails, ensure Rhino Compute is running on http://localhost:5000
 * - If file not found, ensure Live Server is running and serving from project root
 * - Enable debug mode by setting debug: true in the config for detailed logging
 */
async function main() {
	// Configuration
	const DEFINITION_FILE = 'http://127.0.0.1:5500/examples/files/simple_api_test.gh';
	const COMPUTE_SERVER = 'http://localhost:5000';
	// const API_KEY = 'your-api-key'; // Replace with your actual API key if needed

	const config = {
		serverUrl: COMPUTE_SERVER,
		// apiKey: API_KEY,
		debug: false // Set to true for detailed logging
	} as GrasshopperComputeConfig;

	let client: GrasshopperClient | null = null;

	try {
		// Step 1: Create and initialize the client
		console.error('Creating GrasshopperClient...');
		try {
			client = await GrasshopperClient.create(config);
			console.error('✓ Client created successfully');
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`✗ Failed to create client: ${message}`);
			console.error('  Make sure Rhino Compute is running on', COMPUTE_SERVER);
			throw error;
		}

		// Step 2: Get definition inputs and outputs
		console.error('Fetching definition metadata...');
		let io;
		try {
			io = await client.getIO(DEFINITION_FILE);
			console.error(`✓ Found ${io.inputs.length} inputs and ${io.outputs.length} outputs`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`✗ Failed to fetch definition: ${message}`);
			console.error('  Make sure the file exists at:', DEFINITION_FILE);
			throw error;
		}

		// Step 3: Build input data tree from definition parameters
		console.error('Building input tree...');
		const inputTree = TreeBuilder.fromInputParams(io.inputs);

		// Log available inputs
		if (io.inputs.length > 0) {
			console.error('Available inputs:', io.inputs.map((input) => input.name).join(', '));
		}

		// Example: Modify input values if needed
		// Check if the input exists before modifying
		const inputToModify = 'number_input_2';
		const inputExists = io.inputs.some((input) => input.name === inputToModify);
		if (inputExists) {
			TreeBuilder.replaceTreeValue(inputTree, inputToModify, 30);
			console.error(`✓ Updated ${inputToModify} to 30`);
		} else {
			console.error(`⚠ Input "${inputToModify}" not found in definition`);
		}

		// Step 4: Run the computation
		console.error('Running computation...');
		let result;
		try {
			result = await client.solve(DEFINITION_FILE, inputTree);
			console.error('✓ Computation completed successfully');
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`✗ Computation failed: ${message}`);
			throw error;
		}

		// Step 5: Process and display results
		console.error('Processing results...');
		const processor = new GrasshopperResponseProcessor(result);
		const { values } = processor.getValues();
		console.error('✓ Results processed');

		// Display results in a structured format
		if (values && Object.keys(values).length > 0) {
			console.error('Output values:');
			Object.entries(values).forEach(([key, value]) => {
				console.error(`  ${key}:`, value);
			});
		} else {
			console.error('No output values returned');
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error('\n✗ Example failed:', message);
		process.exit(1);
	} finally {
		// Step 6: Clean up resources
		if (client) {
			try {
				await client.dispose();
				console.error('✓ Client disposed');
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error('⚠ Error disposing client:', message);
			}
		}
	}
}

main();
