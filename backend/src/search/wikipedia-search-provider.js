import { searchInputSchema } from '../contracts/search.js';
import { InvalidInputError, UpstreamError } from '../domain/errors.js';

function buildSignal(timeoutMs, callerSignal) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return callerSignal ? AbortSignal.any([timeoutSignal, callerSignal]) : timeoutSignal;
}

export class WikipediaSearchProvider {
  constructor({
    language = 'zh',
    timeoutMs = 5000,
    fetchImplementation = globalThis.fetch,
    clock = () => new Date(),
  } = {}) {
    if (!/^[a-z-]{2,12}$/.test(language)) {
      throw new InvalidInputError('Invalid Wikipedia language code');
    }
    this.language = language;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImplementation;
    this.clock = clock;
  }

  async search(input, { signal } = {}) {
    const parsed = searchInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new InvalidInputError('Invalid search input', parsed.error.flatten());
    }

    const endpoint = new URL(`https://${this.language}.wikipedia.org/w/api.php`);
    endpoint.searchParams.set('action', 'query');
    endpoint.searchParams.set('list', 'search');
    endpoint.searchParams.set('format', 'json');
    endpoint.searchParams.set('origin', '*');
    endpoint.searchParams.set('srsearch', parsed.data.question);
    endpoint.searchParams.set('srlimit', String(parsed.data.limit));
    endpoint.searchParams.set('srprop', 'timestamp');

    let response;
    try {
      response = await this.fetch(endpoint, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: buildSignal(this.timeoutMs, signal),
      });
    } catch (error) {
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        throw new UpstreamError('TIMEOUT', 'Search provider timed out');
      }
      throw new UpstreamError('SERVICE_UNAVAILABLE', 'Search provider is unavailable');
    }

    if (!response.ok) {
      throw new UpstreamError(
        'SERVICE_UNAVAILABLE',
        `Search provider returned HTTP ${response.status}`,
      );
    }

    const payload = await response.json();
    const results = payload?.query?.search;
    if (!Array.isArray(results)) {
      throw new UpstreamError('SERVICE_UNAVAILABLE', 'Search provider returned an invalid response');
    }

    const retrievedAt = this.clock().toISOString();
    const sources = results.map((result) => ({
      id: String(result.pageid),
      title: result.title,
      url: `https://${this.language}.wikipedia.org/wiki/${encodeURIComponent(result.title.replaceAll(' ', '_'))}`,
      publishedAt: result.timestamp ?? null,
      retrievedAt,
      quality: 'CURRENT',
      publisher: 'Wikipedia',
    }));

    return {
      searchState: sources.length > 0 ? 'SUCCESS' : 'EMPTY',
      partial: false,
      hasConflict: false,
      claims: [],
      sources,
    };
  }
}
