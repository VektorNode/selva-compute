import { createConfig } from '@selva/config/eslint';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default [
  ...createConfig(__dirname),
  {
    ignores: ['coverage/'],
  },
];
