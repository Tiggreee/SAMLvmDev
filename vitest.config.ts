import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    hookTimeout: 20000,
  },
  resolve: {
    alias: {
      '@domain': resolve(root, 'src/domain'),
      '@application': resolve(root, 'src/application'),
      '@infrastructure': resolve(root, 'src/infrastructure'),
      '@interfaces': resolve(root, 'src/interfaces'),
      '@shared': resolve(root, 'src/shared'),
    },
  },
});
