import { WikipediaSearchProvider } from '../src/search/wikipedia-search-provider.js';

const question = process.argv[2] ?? '人工智能';
const timeoutMs = Number(process.env.SEARCH_TIMEOUT_MS ?? 8000);
const startedAt = new Date();
const provider = new WikipediaSearchProvider({ timeoutMs });

try {
  const result = await provider.search({ question, limit: 5 });
  const firstSource = result.sources[0] ?? null;
  let firstSourceCheck = null;
  if (firstSource) {
    try {
      const response = await fetch(firstSource.url, {
        method: 'HEAD',
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
      firstSourceCheck = { reachable: response.ok, status: response.status };
    } catch {
      firstSourceCheck = { reachable: false, status: null };
    }
  }

  console.log(JSON.stringify({
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    timeoutMs,
    searchState: result.searchState,
    partial: result.partial,
    sourceCount: result.sources.length,
    firstSource,
    firstSourceCheck,
  }));
} catch (error) {
  console.log(JSON.stringify({
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    timeoutMs,
    errorCode: error?.code ?? 'UNKNOWN',
    message: error?.message ?? 'Search verification failed',
  }));
  process.exitCode = 2;
}
