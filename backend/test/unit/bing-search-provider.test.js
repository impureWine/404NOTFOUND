import assert from 'node:assert/strict';
import test from 'node:test';
import { BingSearchProvider } from '../../src/search/bing-search-provider.js';
import { InvalidInputError } from '../../src/domain/errors.js';

const KEY = 'synthetic-serp-key-do-not-use';
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const payload = items => ({ search_metadata: { status: 'Success' }, organic_results: items });
const item = (url = 'https://example.org/source') => ({ title: 'Synthetic source', link: url, snippet: 'A search excerpt, not a verified fact.' });
const provider = fetchImplementation => new BingSearchProvider({ apiKey: KEY, fetchImplementation });

test('Bing uses the fixed SerpAPI engine and returns only normalized organic sources', async () => {
  let request;
  const p = provider(async (url, options) => { request = { url, options }; return json({ ...payload([item()]), ads: [item('https://ads.example.org')], search_parameters: { api_key: KEY } }); });
  const result = await p.search({ question: 'synthetic question', limit: 1 });
  assert.equal(request.url.origin, 'https://serpapi.com'); assert.equal(request.url.pathname, '/search.json');
  assert.equal(request.url.searchParams.get('engine'), 'bing'); assert.equal(request.url.searchParams.get('q'), 'synthetic question');
  assert.equal(request.url.searchParams.get('api_key'), KEY); assert.equal(request.url.searchParams.get('mkt'), 'zh-CN');
  assert.equal(request.options.redirect, 'error');
  assert.equal(result.searchState, 'SUCCESS'); assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].url, 'https://example.org/source'); assert.equal(result.sources[0].publisher, 'example.org');
  assert.equal(result.sources[0].verificationState, 'PARTIAL'); assert.equal(result.sources[0].sourceTier, 'SX');
  assert.equal(result.sources[0].publishedAt, null); assert.deepEqual(result.claims, []);
  assert.match(result.sources[0].id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(JSON.stringify(result).includes(KEY), false);
});

test('missing credentials fail clearly without making a network call', async () => {
  let called = false;
  const p = new BingSearchProvider({ apiKey: '', fetchImplementation: async () => { called = true; } });
  assert.deepEqual(p.getCapabilities(), { provider: 'bing', configured: false });
  await assert.rejects(p.search({ question: 'test' }), error => error.code === 'SEARCH_NOT_CONFIGURED');
  assert.equal(called, false);
});

test('empty search results are distinct from malformed or failed responses', async () => {
  for (const value of [payload([]), { search_metadata: { status: 'Success' }, search_information: { organic_results_state: 'Fully empty' } }]) {
    const result = await provider(async () => json(value)).search({ question: 'empty' });
    assert.equal(result.searchState, 'EMPTY'); assert.deepEqual(result.sources, []);
  }
  for (const value of [{}, payload(null), { search_metadata: { status: 'Processing' } }, { ...payload([]), error: 'upstream failure' }]) {
    await assert.rejects(provider(async () => json(value)).search({ question: 'bad' }), error => error.code === 'SERVICE_UNAVAILABLE');
  }
});

test('sources reject unsafe URLs, de-duplicate links, cap results and never trust a snippet as verified', async () => {
  const p = provider(async () => json(payload([item('javascript:alert(1)'), item('https://user:password@example.org'), item('https://example.org/a#one'), item('https://example.org/a#two'), { title: 'No excerpt', link: 'https://example.org/b' }, item('https://example.org/c')])));
  const result = await p.search({ question: 'test', limit: 2 });
  assert.equal(result.sources.length, 2); assert.equal(result.partial, true);
  assert.equal(result.sources[0].url, 'https://example.org/a'); assert.equal(result.sources[1].snippet, '');
  assert.equal(result.sources.every(source => source.verificationState === 'PARTIAL'), true);
  await assert.rejects(provider(async () => json(payload([item('data:text/plain,x')]))).search({ question: 'bad' }), error => error.code === 'SERVICE_UNAVAILABLE');
});

test('source IDs are stable across queries and source metadata stays bounded', async () => {
  const p = provider(async () => json(payload([{ ...item(), title: '中'.repeat(600), snippet: 'x'.repeat(5000), date: '2 days ago' }])));
  const a = await p.search({ question: 'first' }), b = await p.search({ question: 'second' });
  assert.equal(a.sources[0].id, b.sources[0].id); assert.equal(Array.from(a.sources[0].title).length, 512);
  assert.equal(a.sources[0].snippet.length, 4000); assert.equal(a.sources[0].publishedAt, null);
});

for (const [status, code] of [[401, 'SEARCH_AUTH_FAILED'], [403, 'SEARCH_AUTH_FAILED'], [402, 'SEARCH_RATE_LIMITED'], [429, 'SEARCH_RATE_LIMITED'], [500, 'SERVICE_UNAVAILABLE']]) {
  test(`Bing HTTP ${status} maps to ${code} without leaking upstream credentials`, async () => {
    await assert.rejects(provider(async () => json({ error: KEY }, status)).search({ question: 'test' }), error => error.code === code && !String(error).includes(KEY));
  });
}

test('network errors, HTML, invalid JSON and oversized bodies return sanitized errors', async () => {
  const responses = [() => { throw new Error(`network ${KEY}`); }, () => new Response(`<html>${KEY}</html>`), () => new Response('{bad', { headers: { 'content-type': 'application/json' } }), () => json({ data: 'x'.repeat(1024 * 1024) })];
  for (const create of responses) {
    await assert.rejects(provider(async () => create()).search({ question: 'test' }), error => error.code === 'SERVICE_UNAVAILABLE' && !String(error).includes(KEY));
  }
});

test('Bing deadline covers both connecting and reading the response body', async () => {
  for (const fetchImplementation of [async () => new Promise(() => {}), async () => new Response(new ReadableStream({ start() {} }), { headers: { 'content-type': 'application/json' } })]) {
    const p = new BingSearchProvider({ apiKey: KEY, timeoutMs: 10, fetchImplementation });
    await assert.rejects(p.search({ question: 'test' }), error => error.code === 'TIMEOUT');
  }
});

test('caller cancellation remains cancellation, including a pre-cancelled request', async () => {
  const p = provider(async () => new Promise(() => {}));
  const controller = new AbortController();
  const pending = p.search({ question: 'test' }, { signal: controller.signal });
  controller.abort(new DOMException('cancelled', 'AbortError'));
  await assert.rejects(pending, error => error.name === 'AbortError');
  await assert.rejects(p.search({ question: 'test' }, { signal: controller.signal }), error => error.name === 'AbortError');
});

test('Bing rejects invalid settings and search payloads before calling the service', async () => {
  assert.throws(() => new BingSearchProvider({ market: 'zh..evil' }), InvalidInputError);
  assert.throws(() => new BingSearchProvider({ timeoutMs: 30001 }), InvalidInputError);
  await assert.rejects(provider(async () => { throw new Error('must not call'); }).search({ question: '' }), InvalidInputError);
});
