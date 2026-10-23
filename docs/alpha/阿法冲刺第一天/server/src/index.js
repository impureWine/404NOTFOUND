import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = createApp();

const server = app.listen(config.PORT, config.HOST, () => {
  console.info(`404NOTFOUND API listening on http://${config.HOST}:${config.PORT}`);
});

const shutdown = (signal) => {
  console.info(`${signal} received, closing HTTP server`);
  server.close(() => process.exit(0));
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
