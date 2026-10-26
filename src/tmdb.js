const TTL_MS = 10 * 60 * 1000;
const MAX_CACHE = 200;
const REGION = 'US'; // shortcut: one hard-coded region, make it a setting if you two live elsewhere

function createTmdb({ token, fetch = globalThis.fetch }) {
  const cache = new Map(); // shortcut: in-memory, lost on restart, fine for one instance

  async function get(path, params = '') {
    const res = await fetch(`https://api.themoviedb.org/3${path}${params}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`TMDB HTTP ${res.status}`);
    return res.json();
  }

  // Where to watch in REGION, or null when TMDB has no listing. Throws on upstream failure.
  async function providers(imdbId, kind) {
    const key = `${imdbId}:${kind}`;
    const hit = cache.get(key);
    if (hit && hit.exp > Date.now()) return hit.value;

    const type = kind === 'show' ? 'tv' : 'movie';
    const found = await get(`/find/${encodeURIComponent(imdbId)}`, '?external_source=imdb_id');
    const match = (found[`${type}_results`] || [])[0];
    let value = null;
    if (match) {
      const r = (await get(`/${type}/${match.id}/watch/providers`)).results?.[REGION];
      const names = (list) => (list || []).map((p) => p.provider_name);
      if (r) value = { link: r.link?.startsWith('https://') ? r.link : null, stream: names(r.flatrate), rent: names(r.rent), buy: names(r.buy) };
    }
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(key, { value, exp: Date.now() + TTL_MS });
    return value;
  }

  return { providers };
}

module.exports = { createTmdb };
