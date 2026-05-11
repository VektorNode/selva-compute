import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
	resolve: {
		alias: {
			'@': resolve(__dirname, 'src')
		}
	},
	root: 'examples',
	server: {
		port: 5173,
		open: '/viewer_example.html',
		fs: { allow: ['..'] }
	}
});
