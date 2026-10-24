import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const configDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  publicDir: resolve(configDir, '../web-prototype'),
  server: { host: '0.0.0.0' },
  build: {
    rollupOptions: {
      input: {
        main: resolve(configDir, 'index.html'),
        uxComponents: resolve(configDir, 'ux-components.html'),
      },
    },
  },
});
