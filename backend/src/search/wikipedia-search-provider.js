import { createHash } from 'node:crypto';

import { searchInputSchema } from '../contracts/search.js';
import { InvalidInputError, UpstreamError } from '../domain/errors.js';

const MAX_RESPONSE_BYTES = 512 * 1024;

function buildRequestSignal(timeoutMs, callerSignal) {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
  return {
    signal: callerSignal
      ? AbortSignal.any([timeoutController.signal, callerSignal])
      : timeoutController.signal,
    timeoutSignal: timeoutController.signal,
    dispose: () => clearTimeout(timeoutId),
  };
}

function stableSourceId(language, pageId) {
  const bytes = createHash('sha256')
    .update(`wikipedia:${language}:${pageId}`, 'utf8')
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

function normalizeSourceUrl(rawUrl, expectedHostname) {
  if (typeof rawUrl !== 'string') return null;
  try {
    const url = new URL(rawUrl);
    if (
      url.protocol !== 'https:'
      || url.hostname !== expectedHostname
      || url.username
      || url.password
      || !url.pathname.startsWith('/wiki/')
    ) {
      return null;
    }
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function buildEndpoint(language, input) {
  const endpoint = new URL(`https://${language}.wikipedia.org/w/api.php`);
  const parameters = {
    action: 'query',
    exchars: '1000',
    exintro: '1',
    explaintext: '1',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrlimit: String(input.limit),
    gsrnamespace: '0',
    gsrsearch: input.question,
    inprop: 'url',
    origin: '*',
    prop: 'info|extracts',
    redirects: '1',
    utf8: '1',
  };
  for (const [name, value] of Object.entries(parameters)) {
    endpoint.searchParams.set(name, value);
  }
  return endpoint;
}

async function readPayload(response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new UpstreamError('SERVICE_UNAVAILABLE', 'Search provider returned a non-JSON response');
  }

  let text;
  try {
    text = await response.text();
  } catch {
    throw new UpstreamError('SERVICE_UNAVAILABLE', 'Search provider response could not be read');
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new UpstreamError(
      'SERVICE_UNAVAILABLE',
      'Search provider response exceeded the size limit',
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new UpstreamError('SERVICE_UNAVAILABLE', 'Search provider returned invalid JSON');
  }
}

function normalizePages(pages, language, retrievedAt) {
  const expectedHostname = `${language}.wikipedia.org`;
  let partial = false;
  const sources = [];
  for (const page of pages) {
    const title = typeof page?.title === 'string' ? page.title.trim() : '';
    const url = normalizeSourceUrl(page?.fullurl, expectedHostname);
    if (!Number.isInteger(page?.pageid) || page.pageid <= 0 || !title || !url) {
      partial = true;
      continue;
    }
    const hasExtract = typeof page.extract === 'string' && page.extract.trim();
    sources.push({
      id: stableSourceId(language, page.pageid),
      title,
      url,
      publishedAt: null,
      retrievedAt,
      quality: 'UNKNOWN',
      publisher: 'Wikipedia',
      sourceTier: 'S3',
      verificationState: hasExtract ? 'VERIFIED' : 'PARTIAL',
    });
    if (!hasExtract) partial = true;
  }

  if (pages.length > 0 && sources.length === 0) {
    throw new UpstreamError('SERVICE_UNAVAILABLE', 'Search provider returned no valid sources');
  }
  return { partial, sources };
}

export class WikipediaSearchProvider {
  constructor({
    language = 'zh',
    timeoutMs = 5000,
    fetchImplementation = globalThis.fetch,
    clock = () => new Date(),
  } = {}) {
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(language)) {
      throw new InvalidInputError('Invalid Wikipedia language code');
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
      throw new InvalidInputError('Wikipedia timeoutMs must be an integer between 1 and 30000');
    }
    if (typeof fetchImplementation !== 'function' || typeof clock !== 'function') {
      throw new TypeError('Wikipedia provider requires fetch and clock functions');
    }
    this.language = language;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImplementation;
    this.clock = clock;
  }

  /**
   * Retrieves source metadata from the fixed Wikipedia API without generating factual claims.
   * @param {{question: string, limit?: number}} input - Validated search terms and result limit.
   * @param {{signal?: AbortSignal}} options - Optional caller-owned cancellation signal.
   * @returns {Promise<object>} Normalized search state, sources, and an empty claims array.
   * @throws {InvalidInputError} When the search input violates the shared contract.
   * @throws {UpstreamError} When Wikipedia times out or returns an unusable response.
   * Caller cancellation is preserved; provider timeouts and upstream faults use separate codes.
   */
  async search(input, { signal } = {}) {
    const parsed = searchInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new InvalidInputError('Invalid search input', parsed.error.flatten());
    }

    const endpoint = buildEndpoint(this.language, parsed.data);
    const requestSignal = buildRequestSignal(this.timeoutMs, signal);

    let response;
    try {
      response = await this.fetch(endpoint, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: requestSignal.signal,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      if (requestSignal.timeoutSignal.aborted || error?.name === 'TimeoutError') {
        throw new UpstreamError('TIMEOUT', 'Search provider timed out');
      }
      throw new UpstreamError('SERVICE_UNAVAILABLE', 'Search provider is unavailable');
    } finally {
      requestSignal.dispose();
    }

    if (!response.ok) {
      throw new UpstreamError(
        'SERVICE_UNAVAILABLE',
        `Search provider returned HTTP ${response.status}`,
      );
    }

    const payload = await readPayload(response);
    if (payload?.error) {
      throw new UpstreamError('SERVICE_UNAVAILABLE', 'Search provider returned an API error');
    }
    const pages = payload?.query?.pages;
    if (payload?.batchcomplete === true && payload.query === undefined) {
      return {
        searchState: 'EMPTY',
        partial: false,
        hasConflict: false,
        claims: [],
        sources: [],
      };
    }
    if (!Array.isArray(pages)) {
      throw new UpstreamError(
        'SERVICE_UNAVAILABLE',
        'Search provider returned an invalid response',
      );
    }

    const retrievedAt = this.clock().toISOString();
    const { partial, sources } = normalizePages(pages, this.language, retrievedAt);

    return {
      searchState: sources.length > 0 ? 'SUCCESS' : 'EMPTY',
      partial,
      hasConflict: false,
      claims: [],
      sources,
    };
  }
}
