import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after } from 'node:test';

// Launches only the project's in-memory PGlite test database and a loopback HTTP server.
const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = process.env.TEST_BACKEND_DIR || resolve(here, '../../../../参考源码核验/新版本_555f64c/backend');
const origin = 'http://127.0.0.1:5173';
const key = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='; // Synthetic test-only key.

const [{ createApp }, { parseProfileKey }, { AuthService }, { createTestDatabase }] = await Promise.all([
  import(pathToFileURL(resolve(backendRoot, 'src/app.js')).href),
  import(pathToFileURL(resolve(backendRoot, 'src/security/crypto.js')).href),
  import(pathToFileURL(resolve(backendRoot, 'src/services/auth-service.js')).href),
  import(pathToFileURL(resolve(backendRoot, 'test/helpers/database.js')).href),
]);

const database = await createTestDatabase();
const authService = new AuthService(database, { profileKey: parseProfileKey(key) });
const server = createApp({ database, authService, appOrigin: origin }).listen(0, '127.0.0.1');
await new Promise((resolveReady, reject) => {
  server.once('listening', resolveReady);
  server.once('error', reject);
});
after(async () => {
  await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
  await database.close();
});
process.env.TEST_ISOLATED_API = '1';
process.env.TEST_API_BASE_URL = `http://127.0.0.1:${server.address().port}/`;
process.env.TEST_APP_ORIGIN = origin;
process.env.TEST_CSRF_HEADER_NAME = 'X-CSRF-Token';
process.env.TEST_LOGIN_TARGET = 'PROFILE';
await import(pathToFileURL(resolve(here, 'auth-profile-api.test.mjs')).href);
