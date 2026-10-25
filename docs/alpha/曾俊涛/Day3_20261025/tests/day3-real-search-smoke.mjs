/** Public Wikipedia request, no account, model key or private user text. */
import { WikipediaSearchProvider } from '../../../../../backend/src/search/wikipedia-search-provider.js';

const provider = new WikipediaSearchProvider({ language: 'zh', timeoutMs: 8000 });
const startedAt = new Date().toISOString();
try {
  const result = await provider.search({ question: '情绪调节', limit: 2 });
  const summary = {
    startedAt,
    completedAt: new Date().toISOString(),
    layer: 'direct WikipediaSearchProvider call, not page-to-API flow',
    searchState: result.searchState,
    sources: result.sources.map(({ title, url, retrievedAt }) => ({ title, url, retrievedAt })),
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (result.searchState !== 'SUCCESS' || result.sources.length === 0) process.exitCode = 2;
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    startedAt,
    completedAt: new Date().toISOString(),
    layer: 'direct WikipediaSearchProvider call, not page-to-API flow',
    status: 'failed',
    code: error?.code ?? 'UNCLASSIFIED',
    message: error?.message ?? String(error),
  }, null, 2)}\n`);
  process.exitCode = 1;
}
