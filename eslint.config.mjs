import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

/** @type {import('eslint').Linter.Config[]} */
export const config = [
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs['flat/prettier'],
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser,
				extraFileExtensions: ['.svelte']
			}
		}
	},
	{
		files: ['**/*.svelte.ts'],
		languageOptions: {
			parser: ts.parser
		}
	},
	{
		ignores: ['build/', '.svelte-kit/', 'dist/', 'node_modules/']
	},
	{
		rules: {
			'no-console': ['warn', { allow: ['warn', 'error'] }],
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
			],
			'@typescript-eslint/no-explicit-any': 'warn',
			'svelte/no-at-html-tags': 'warn'
		}
	}
];

/**
 * Create a project-specific ESLint config
 * @param {string} tsconfigRootDir - The root directory of the project (usually __dirname)
 * @returns {import('eslint').Linter.Config[]}
 */
export const createConfig = (tsconfigRootDir) => [
	...config,
	{
		files: ['**/*.ts', '**/*.tsx', '**/*.svelte'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir,
				extraFileExtensions: ['.svelte']
			}
		}
	}
];

export default config;
