import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { readdir, writeFile } from 'node:fs/promises';

const configDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, configDir, '');
  return {
    plugins: [{
      name: 'real-business-entrypoints',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const name = (request.url || '').split('?')[0].split('/').pop();
          if (!name?.endsWith('.html') || name === 'index.html') return next();
          const route = legacyRoute(name);
          response.setHeader('Content-Type', 'text/html; charset=utf-8');
          response.end(redirectPage(route));
        });
      },
      async writeBundle(options) {
        const output = options.dir || resolve(configDir, 'dist');
        for (const name of [...await readdir(resolve(configDir, '../web-prototype')), 'ux-components.html']) {
          if (name.endsWith('.html')) await writeFile(resolve(output, name), redirectPage(legacyRoute(name)), 'utf8');
        }
      },
    }],
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
      emptyOutDir: false,
      rollupOptions: {
        input: {
          main: resolve(configDir, 'index.html'),
        },
      },
    },
  };
});

function legacyRoute(name) {
  const routes = { 'home':'home', 'companion':'companion', 'calendar':'calendar', 'worry-room':'worry', 'rehearsal':'rehearsal', 'rehearsal-complete':'rehearsal-records', 'games':'games', 'pressure-toy':'pressure', 'things-organize':'things', 'pause-organize':'pause-organize', 'task-splitting':'task-splitting', 'five-senses':'training', 'emotion-card':'emotion', 'info-query':'search', 'info-empty':'search', 'settings':'settings', 'profile':'settings', 'login':'login', 'register':'register' };
  const key = name.slice(0,-5);
  return routes[key] || (key.startsWith('companion-') ? 'companion' : key.startsWith('calendar-') ? 'calendar' : 'home');
}
function redirectPage(route) {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>404NOTFOUND</title><script>location.replace('./#${route}')</script><a href="./#${route}">进入真实服务</a></html>`;
}
