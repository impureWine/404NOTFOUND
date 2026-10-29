import { loadEnvFile } from 'node:process';

import { inspectReleaseReadiness } from '../src/runtime-config.js';
import { parseProfileKey } from '../src/security/crypto.js';

try {
  loadEnvFile();
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const result = inspectReleaseReadiness(process.env);
const issues = [...result.issues];
if (result.ready) {
  try {
    parseProfileKey(process.env.PROFILE_ENCRYPTION_KEY);
  } catch (error) {
    issues.push(error.message);
  }
}

if (!result.ready || issues.length > 0) {
  console.error('Release readiness: BLOCKED');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log('Release readiness: READY');
  console.log(JSON.stringify({
    port: result.config.port,
    appOrigin: result.config.appOrigin,
    secureCookies: result.config.secureCookies,
    databaseSsl: result.config.database.ssl,
    searchLanguage: result.config.search.language,
  }, null, 2));
}
