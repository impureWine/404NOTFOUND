import { createHash } from 'node:crypto';
import { searchInputSchema } from '../contracts/search.js';
import { InvalidInputError, UpstreamError } from '../domain/errors.js';

const ENDPOINT = 'https://serpapi.com/search.json';
const MAX_BYTES = 1024 * 1024;
const unavailable = () => new UpstreamError('SERVICE_UNAVAILABLE', 'Bing search is unavailable');

function sourceId(url) {
  const bytes = createHash('sha256').update(`bing:${url}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function sourceUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    return url;
  } catch { return null; }
}

async function readJson(response) {
  if (!(response.headers.get('content-type') || '').toLowerCase().includes('application/json')) throw unavailable();
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BYTES) throw unavailable();
  const reader = response.body?.getReader();
  if (!reader) throw unavailable();
  const chunks = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) { await reader.cancel(); throw unavailable(); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { reader.releaseLock(); }
}

/** Bing results via SerpAPI, not the retired Microsoft Bing Search API. */
export class BingSearchProvider {
  constructor({ apiKey = process.env.SERPAPI_API_KEY, market = 'zh-CN', timeoutMs = 15000, fetchImplementation = globalThis.fetch, clock = () => new Date() } = {}) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new InvalidInputError('Bing timeoutMs must be between 1 and 30000');
    if (!/^[a-z]{2,3}-[A-Z]{2}$/.test(market)) throw new InvalidInputError('Invalid Bing search market');
    if (typeof fetchImplementation !== 'function' || typeof clock !== 'function') throw new TypeError('Bing provider requires fetch and clock functions');
    this.apiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
    this.market = market; this.timeoutMs = timeoutMs; this.fetch = fetchImplementation; this.clock = clock;
  }
  getCapabilities() { return { provider: 'bing', configured: Boolean(this.apiKey) }; }

  async search(input, { signal: callerSignal } = {}) {
    const parsed = searchInputSchema.safeParse(input);
    if (!parsed.success) throw new InvalidInputError('Invalid search input');
    callerSignal?.throwIfAborted();
    if (!this.apiKey) throw new UpstreamError('SEARCH_NOT_CONFIGURED', 'Bing search key is not configured');
    const url = new URL(ENDPOINT);
    for (const [key, value] of Object.entries({ engine: 'bing', q: parsed.data.question, mkt: this.market, api_key: this.apiKey, output: 'json' })) url.searchParams.set(key, value);
    const timeout = new AbortController();
    const signal = callerSignal ? AbortSignal.any([callerSignal, timeout.signal]) : timeout.signal;
    const timer = setTimeout(() => timeout.abort(), this.timeoutMs);
    let abort;
    try {
      const payload = await Promise.race([
        (async () => {
          const response = await this.fetch(url, { headers: { Accept: 'application/json' }, redirect: 'error', signal });
          if ([401, 403].includes(response.status)) throw new UpstreamError('SEARCH_AUTH_FAILED', 'Bing search credentials were rejected');
          if ([402, 429].includes(response.status)) throw new UpstreamError('SEARCH_RATE_LIMITED', 'Bing search quota or rate limit reached');
          if (!response.ok) throw unavailable();
          return readJson(response);
        })(),
        new Promise((_, reject) => {
          abort = () => reject(signal.reason);
          signal.addEventListener('abort', abort, { once: true });
          if (signal.aborted) abort();
        }),
      ]);
      if (!payload || typeof payload !== 'object' || payload.error || payload.search_metadata?.status !== 'Success') throw unavailable();
      const items = payload.organic_results;
      if (!Array.isArray(items)) {
        // SerpAPI can omit organic_results for a completed, fully empty query.
        if (payload.search_information?.organic_results_state !== 'Fully empty') throw unavailable();
        return { searchState: 'EMPTY', partial: false, hasConflict: false, sources: [], claims: [] };
      }
      const retrievedAt = this.clock().toISOString(), sources = [], seen = new Set(); let partial = false;
      for (const item of items) {
        const link = sourceUrl(item?.link), title = typeof item?.title === 'string' ? item.title.trim() : '';
        if (!link || !title) { partial = true; continue; }
        const normalized = link.toString();
        if (normalized.includes(this.apiKey) || seen.has(normalized)) { partial = true; continue; }
        seen.add(normalized);
        const snippet = typeof item.snippet === 'string' ? item.snippet.trim().slice(0, 4000) : '';
        sources.push({ id: sourceId(normalized), title: Array.from(title).slice(0,512).join(''), url: normalized, snippet,
          publisher: link.hostname.slice(0,256), sourceTier: 'SX', quality: 'UNKNOWN', publishedAt: null, retrievedAt,
          verificationState: 'PARTIAL' });
        if (!snippet) partial = true;
        if (sources.length === parsed.data.limit) break;
      }
      if (items.length && !sources.length) throw unavailable();
      return { searchState: sources.length ? 'SUCCESS' : 'EMPTY', partial, hasConflict: false, sources, claims: [] };
    } catch (error) {
      if (callerSignal?.aborted) throw callerSignal.reason;
      if (timeout.signal.aborted || error?.name === 'TimeoutError') throw new UpstreamError('TIMEOUT', 'Bing search timed out');
      if (error instanceof UpstreamError) throw error;
      // Do not surface the URL, key, question, response body or upstream error.
      throw unavailable();
    } finally {
      clearTimeout(timer);
      if (abort) signal.removeEventListener('abort', abort);
    }
  }
}
