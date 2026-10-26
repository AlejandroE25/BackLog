const TTL_MS = 10 * 60 * 1000;
const MAX_CACHE = 200;
const KINDS = { movie: 'movie', series: 'show' };

class UpstreamError extends Error {}

function createOmdb({ apiKey, fetch = globalThis.fetch }) {
  const cache = new Map(); // shortcut: in-memory, lost on restart, fine for one instance

  async function search(q) {
    const key = q.trim().toLowerCase();
    const hit = cache.get(key);
    if (hit && hit.exp > Date.now()) return hit.value;

    let data;
    try {
      const url = `https://www.omdbapi.com/?apikey=${encodeURIComponent(apiKey)}&s=${encodeURIComponent(key)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (e) {
      throw new UpstreamError(`OMDb unavailable: ${e.message}`);
    }
    if (data.Response === 'False' && data.Error !== 'Movie not found!') {
      throw new UpstreamError(`OMDb error: ${data.Error}`);
    }

    const value = (data.Search || [])
      .filter((r) => KINDS[r.Type])
      .map((r) => ({
        imdb_id: r.imdbID,
        title: r.Title,
        year: r.Year,
        kind: KINDS[r.Type],
        poster_url: r.Poster && r.Poster !== 'N/A' ? r.Poster : null,
      }));
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(key, { value, exp: Date.now() + TTL_MS });
    return value;
  }

  return { search };
}

module.exports = { createOmdb, UpstreamError };
