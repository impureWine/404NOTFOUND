import { BingSearchProvider } from '../src/search/bing-search-provider.js';
try { process.loadEnvFile(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const begin = Date.now();
try {
  const provider = new BingSearchProvider({ apiKey: process.env.SERPAPI_API_KEY, market: process.env.BING_SEARCH_MARKET || 'zh-CN', timeoutMs: Number(process.env.SEARCH_TIMEOUT_MS || 15000) });
  const result = await provider.search({ question: 'computer', limit: 1 });
  console.log(JSON.stringify({ status: 'success', provider: 'bing', via: 'SerpAPI', elapsedMs: Date.now() - begin, sourceCount: result.sources.length, sources: result.sources.map(({ title, url }) => ({ title, url })) }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ status: 'failed', provider: 'bing', elapsedMs: Date.now() - begin, code: error.code || 'SERVICE_UNAVAILABLE' }, null, 2));
  process.exitCode = 1;
}
