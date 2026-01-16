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
 * - A Rhino Compute server running (default: http://localhost:6500)
 * - A Grasshopper definition file (.gh)
 * - (Optional) An API key if your server requires authentication
 */
async function main() {
	// Configuration
	const DEFINITION_FILE = 'my-definition.gh';
	const COMPUTE_SERVER = 'http://localhost:6500';
	const API_KEY = 'your-api-key'; // Replace with your actual API key if needed

	const config = {
		serverUrl: COMPUTE_SERVER,
		apiKey: API_KEY,
		debug: false // Set to true for detailed logging
	} as GrasshopperComputeConfig;

	let client: GrasshopperClient | null = null;

	try {
		// Step 1: Create and initialize the client
		console.error('Creating GrasshopperClient...');
		client = await GrasshopperClient.create(config);
		console.error('✓ Client created successfully');

		// Step 2: Get definition inputs and outputs
		console.error('Fetching definition metadata...');
		const io = await client.getIO(DEFINITION_FILE);
		console.error(`✓ Found ${io.inputs.length} inputs and ${io.outputs.length} outputs`);

		// Step 3: Build input data tree from definition parameters
		// TreeBuilder automatically creates the correct DataTree structure
		const inputTree = TreeBuilder.fromInputParams(io.inputs);

		// Step 4: Run the computation
		console.error('Running computation...');
		const result = await client.solve(DEFINITION_FILE, inputTree);
		console.error('✓ Computation completed');

		// Step 5: Process and display results
		const processor = new GrasshopperResponseProcessor(result);
		const { values } = processor.getValues();
		console.error('✓ Results processed');
		console.error('Output values:', values);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error('Error:', message);
		process.exit(1);
	} finally {
		// Step 6: Clean up resources
		if (client) {
			await client.dispose();
			console.error('✓ Client disposed');
		}
	}
}

main();
