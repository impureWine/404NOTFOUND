import assert from 'node:assert/strict';
import test from 'node:test';

import { UpstreamError } from '../../src/domain/errors.js';
import { WikipediaSearchProvider } from '../../src/search/wikipedia-search-provider.js';

test('provider maps real-source fields without inventing claims', async () => {
  const provider = new WikipediaSearchProvider({
    fetchImplementation: async () => new Response(JSON.stringify({
      query: {
        search: [
          { pageid: 42, title: '测试 页面', timestamp: '2026-10-20T00:00:00Z' },
        ],
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
    clock: () => new Date('2026-10-23T08:00:00Z'),
  });

  const result = await provider.search({ question: '测试', limit: 5 });
  assert.equal(result.searchState, 'SUCCESS');
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].title, '测试 页面');
  assert.match(result.sources[0].url, /^https:\/\/zh\.wikipedia\.org\/wiki\//);
  assert.deepEqual(result.claims, []);
});

test('provider distinguishes an empty result', async () => {
  const provider = new WikipediaSearchProvider({
    fetchImplementation: async () => new Response(
      JSON.stringify({ query: { search: [] } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  });
  const result = await provider.search({ question: 'no result', limit: 5 });
  assert.equal(result.searchState, 'EMPTY');
  assert.deepEqual(result.sources, []);
});

test('provider reports timeout separately from other upstream errors', async () => {
  const provider = new WikipediaSearchProvider({
    timeoutMs: 5,
    fetchImplementation: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }),
  });
  await assert.rejects(
    provider.search({ question: 'timeout', limit: 5 }),
    (error) => error instanceof UpstreamError && error.code === 'TIMEOUT',
  );
});
