const headers = {
  'Access-Control-Allow-Origin': 'https://emmytattoo.com',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });

async function googleJson(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
  const data = await response.json();
  if (!response.ok || data.error) {
    // Log only provider status, not the API key, request headers, or raw payload.
    console.error('[Reviews] Google Places rejected request', response.status, data.error?.status || 'UPSTREAM_ERROR');
    throw new Error('Google Places unavailable');
  }
  return data;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
    }
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    if (!env.GOOGLE_KEY) {
      console.error('[Reviews] Missing GOOGLE_KEY binding');
      return json({ error: 'Reviews temporarily unavailable' }, 503);
    }
    try {
      const search = await googleJson('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': env.GOOGLE_KEY,
          'X-Goog-FieldMask': 'places.id',
        },
        body: JSON.stringify({ textQuery: 'Emmy Tattoo Sainthood Hull' }),
      });
      const placeId = search.places?.[0]?.id;
      if (typeof placeId !== 'string' || !placeId) {
        console.error('[Reviews] Google Places returned no matching place');
        return json({ error: 'Reviews temporarily unavailable' }, 502);
      }
      const detail = await googleJson('https://places.googleapis.com/v1/places/' + encodeURIComponent(placeId), {
        headers: {
          'X-Goog-Api-Key': env.GOOGLE_KEY,
          'X-Goog-FieldMask': 'rating,userRatingCount,reviews',
        },
      });
      if (!Number.isFinite(detail.rating) || detail.rating < 1 || detail.rating > 5 ||
          !Number.isInteger(detail.userRatingCount) || detail.userRatingCount < 1 ||
          !Array.isArray(detail.reviews) || !detail.reviews.length) {
        console.error('[Reviews] Google Places returned an incomplete review summary');
        return json({ error: 'Reviews temporarily unavailable' }, 502);
      }
      return json({ rating: detail.rating, userRatingCount: detail.userRatingCount, reviews: detail.reviews });
    } catch (error) {
      console.error('[Reviews] Feed unavailable', error.name);
      return json({ error: 'Reviews temporarily unavailable' }, 502);
    }
  },
};
