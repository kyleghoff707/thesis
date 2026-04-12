import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.js';

export default mergeConfig(viteConfig, defineConfig({
  test: {
    exclude: [
      'node_modules/**',
      'dist/**',
      '.claude/**',
      'api/node_modules/**',
    ],
  },
}));
