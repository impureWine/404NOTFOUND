import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Local-only browser test service. PGlite is ephemeral; never point this launcher at real data.
const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = process.env.TEST_BACKEND_DIR || resolve(here, '../../../../参考源码核验/主线_230293d_本地测试/backend');
const origin = process.env.TEST_APP_ORIGIN || 'http://127.0.0.1:5173';
const key = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const port = Number(process.env.TEST_API_PORT || 3000);

const [{ createApp }, { parseProfileKey }, { AuthService }, { createTestDatabase }] = await Promise.all([
  import(pathToFileURL(resolve(backendRoot, 'src/app.js')).href),
  import(pathToFileURL(resolve(backendRoot, 'src/security/crypto.js')).href),
  import(pathToFileURL(resolve(backendRoot, 'src/services/auth-service.js')).href),
  import(pathToFileURL(resolve(backendRoot, 'test/helpers/database.js')).href),
]);

const database = await createTestDatabase();
const authService = new AuthService(database, { profileKey: parseProfileKey(key) });
const server = createApp({ database, authService, appOrigin: origin }).listen(port, '127.0.0.1');
await new Promise((resolveReady, reject) => {
  server.once('listening', resolveReady);
  server.once('error', reject);
});
console.log(`ISOLATED_API_READY http://127.0.0.1:${port} origin=${origin}`);

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await new Promise((resolveClose) => server.close(resolveClose));
  await database.close();
}
process.once('SIGINT', () => { shutdown().then(() => process.exit(0)); });
process.once('SIGTERM', () => { shutdown().then(() => process.exit(0)); });
