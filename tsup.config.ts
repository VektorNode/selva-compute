import { defineConfig } from 'tsup';

const entries = {
	index: 'src/index.ts',
	grasshopper: 'src/grasshopper.ts',
	visualization: 'src/visualization.ts',
	core: 'src/core/index.ts'
};

export default defineConfig({
	entry: entries,
	format: ['esm', 'cjs'],
	dts: true,
	splitting: true,
	minify: true,
	sourcemap: true,
	clean: true,
	external: ['three']
});
