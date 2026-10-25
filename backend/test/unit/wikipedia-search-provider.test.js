import assert from 'node:assert/strict';
import test from 'node:test';

import { InvalidInputError, UpstreamError } from '../../src/domain/errors.js';
import { WikipediaSearchProvider } from '../../src/search/wikipedia-search-provider.js';

test('provider maps real-source fields without inventing claims', async () => {
  const provider = new WikipediaSearchProvider({
    fetchImplementation: async () => new Response(JSON.stringify({
      batchcomplete: true,
      query: {
        pages: [
          {
            pageid: 42,
            title: '测试 页面',
            fullurl: 'https://zh.wikipedia.org/wiki/%E6%B5%8B%E8%AF%95_%E9%A1%B5%E9%9D%A2',
            extract: '来自来源的纯文本摘要。',
          },
        ],
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
    clock: () => new Date('2026-10-23T08:00:00Z'),
  });

  const result = await provider.search({ question: '测试', limit: 5 });
  assert.equal(result.searchState, 'SUCCESS');
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].title, '测试 页面');
  assert.match(
    result.sources[0].id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.match(result.sources[0].url, /^https:\/\/zh\.wikipedia\.org\/wiki\//);
  assert.equal(result.sources[0].publishedAt, null);
  assert.equal(result.sources[0].quality, 'UNKNOWN');
  assert.equal(result.sources[0].verificationState, 'VERIFIED');
  assert.deepEqual(result.claims, []);
});

test('provider distinguishes an empty result', async () => {
  const provider = new WikipediaSearchProvider({
    fetchImplementation: async () => new Response(
      JSON.stringify({ batchcomplete: true, query: { pages: [] } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  });
  const result = await provider.search({ question: 'no result', limit: 5 });
  assert.equal(result.searchState, 'EMPTY');
  assert.deepEqual(result.sources, []);
});

test('provider marks incomplete results partial', async () => {
  const provider = new WikipediaSearchProvider({
    fetchImplementation: async () => new Response(JSON.stringify({
      batchcomplete: true,
      query: {
        pages: [
          {
            pageid: 7,
            title: '有效来源',
            fullurl: 'https://zh.wikipedia.org/wiki/%E6%9C%89%E6%95%88%E6%9D%A5%E6%BA%90',
          },
          {
            pageid: 8,
            title: '非法来源',
            fullurl: 'javascript:alert(1)',
            extract: '不应返回。',
          },
        ],
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
  });

  const result = await provider.search({ question: '字段缺失', limit: 5 });
  assert.equal(result.searchState, 'SUCCESS');
  assert.equal(result.partial, true);
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].verificationState, 'PARTIAL');

});

test('provider rejects a non-empty result containing only invalid sources', async () => {
  const provider = new WikipediaSearchProvider({
    fetchImplementation: async () => new Response(JSON.stringify({
      batchcomplete: true,
      query: { pages: [{ pageid: 9, title: '非法来源', fullurl: 'https://example.org' }] },
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
  });
  await assert.rejects(
    provider.search({ question: '非法链接', limit: 5 }),
    (error) => error instanceof UpstreamError && error.code === 'SERVICE_UNAVAILABLE',
  );
});

test('provider rejects API errors, invalid JSON, and unsafe configuration', async () => {
  const apiErrorProvider = new WikipediaSearchProvider({
    fetchImplementation: async () => new Response(
      JSON.stringify({ error: { code: 'synthetic-error' } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  });
  await assert.rejects(
    apiErrorProvider.search({ question: 'API错误', limit: 5 }),
    (error) => error instanceof UpstreamError && error.code === 'SERVICE_UNAVAILABLE',
  );

  const invalidJsonProvider = new WikipediaSearchProvider({
    fetchImplementation: async () => new Response('{', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });
  await assert.rejects(
    invalidJsonProvider.search({ question: '错误JSON', limit: 5 }),
    (error) => error instanceof UpstreamError && error.code === 'SERVICE_UNAVAILABLE',
  );

  assert.throws(
    () => new WikipediaSearchProvider({ language: 'zh..invalid' }),
    InvalidInputError,
  );
  assert.throws(
    () => new WikipediaSearchProvider({ timeoutMs: 30_001 }),
    InvalidInputError,
  );
});

test('provider reports timeout separately from other upstream errors', async () => {
  const provider = new WikipediaSearchProvider({
    timeoutMs: 5,
    fetchImplementation: async (_url, { signal }) => new Promise((_resolve, reject) => {
      const keepProcessAlive = setTimeout(() => {}, 50);
      signal.addEventListener('abort', () => {
        clearTimeout(keepProcessAlive);
        reject(signal.reason);
      }, { once: true });
    }),
  });
  await assert.rejects(
    provider.search({ question: 'timeout', limit: 5 }),
    (error) => error instanceof UpstreamError && error.code === 'TIMEOUT',
  );
});

test('provider maps network faults to service unavailable', async () => {
  const provider = new WikipediaSearchProvider({
    fetchImplementation: async () => {
      throw new TypeError('synthetic network failure');
    },
  });
  await assert.rejects(
    provider.search({ question: 'network failure', limit: 5 }),
    (error) => error instanceof UpstreamError && error.code === 'SERVICE_UNAVAILABLE',
  );
});

test('provider preserves caller cancellation instead of reporting a timeout', async () => {
  const controller = new AbortController();
  const provider = new WikipediaSearchProvider({
    timeoutMs: 1000,
    fetchImplementation: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }),
  });
  const pending = provider.search(
    { question: 'cancelled', limit: 5 },
    { signal: controller.signal },
  );
  controller.abort(new DOMException('cancelled by caller', 'AbortError'));
  await assert.rejects(
    pending,
    (error) => error?.name === 'AbortError' && !(error instanceof UpstreamError),
  );
});
