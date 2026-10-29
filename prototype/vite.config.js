import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const configDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, configDir, '');
  return {
    base: './',
    publicDir: resolve(configDir, '../web-prototype'),
    server: {
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: env.API_PROXY_TARGET || 'http://127.0.0.1:3000',
          changeOrigin: false,
        },
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: resolve(configDir, 'index.html'),
          uxComponents: resolve(configDir, 'ux-components.html'),
        },
      },
    },
  };
});
