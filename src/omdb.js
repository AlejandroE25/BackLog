const TTL_MS = 10 * 60 * 1000;
const MAX_CACHE = 200;
const KINDS = { movie: 'movie', series: 'show' };

class UpstreamError extends Error {}

function createOmdb({ apiKey, fetch = globalThis.fetch }) {
  const cache = new Map(); // shortcut: in-memory, lost on restart, fine for one instance

  // Returns OMDb's JSON; Response:"False" with `okError` is a normal "nothing found", any other error throws.
  async function call(params, okError) {
    let data;
    try {
      const qs = new URLSearchParams({ apikey: apiKey, ...params });
      const res = await fetch(`https://www.omdbapi.com/?${qs}`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (e) {
      throw new UpstreamError(`OMDb unavailable: ${e.message}`);
    }
    if (data.Response === 'False' && data.Error !== okError) throw new UpstreamError(`OMDb error: ${data.Error}`);
    return data;
  }

  async function search(q) {
    const key = q.trim().toLowerCase();
    const hit = cache.get(key);
    if (hit && hit.exp > Date.now()) return hit.value;

    const data = await call({ s: key }, 'Movie not found!');

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

  // Full details for one title, or null if the id doesn't exist.
  async function lookup(imdbId) {
    const d = await call({ i: imdbId, plot: 'short' }, 'Incorrect IMDb ID.');
    if (d.Response === 'False' || !KINDS[d.Type]) return null;
    const val = (v) => (v && v !== 'N/A' ? v : null);
    return {
      imdb_id: d.imdbID, title: d.Title, year: val(d.Year), kind: KINDS[d.Type],
      poster_url: val(d.Poster), plot: val(d.Plot), imdb_rating: val(d.imdbRating),
    };
  }

  // Long-form IMDb rundown for one title, cached like search.
  async function details(imdbId) {
    const hit = cache.get(imdbId);
    if (hit && hit.exp > Date.now()) return hit.value;
    const d = await call({ i: imdbId, plot: 'full' }, 'Incorrect IMDb ID.');
    if (d.Response === 'False') return null;
    const val = (v) => (v && v !== 'N/A' ? v : null);
    const value = {
      imdb_id: d.imdbID, plot: val(d.Plot), rated: val(d.Rated), runtime: val(d.Runtime), genre: val(d.Genre),
      director: val(d.Director), actors: val(d.Actors), awards: val(d.Awards), imdb_votes: val(d.imdbVotes),
      ratings: (d.Ratings || []).map((r) => ({ source: r.Source, value: r.Value })),
    };
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(imdbId, { value, exp: Date.now() + TTL_MS });
    return value;
  }

  return { search, lookup, details };
}

module.exports = { createOmdb, UpstreamError };
