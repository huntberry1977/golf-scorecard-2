const ALLOWED_IMAGE_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp'
]);
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const TOKEN_TTL_SECONDS = 10 * 60;

function corsHeaders(origin, allowedOrigin) {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  });
  if (origin && origin === allowedOrigin) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

function jsonResponse(data, status, headers) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
  responseHeaders.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}

function encodeBase64Url(value) {
  return encodeBytesBase64Url(new TextEncoder().encode(value));
}

function encodeBytesBase64Url(bytes) {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64Url(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return encodeBytesBase64Url(new Uint8Array(signature));
}

async function makeImageToken(imageUrl, secret) {
  const payload = encodeBase64Url(JSON.stringify({
    url: imageUrl,
    expires: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
  }));
  return `${payload}.${await sign(payload, secret)}`;
}

async function readImageToken(token, secret) {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  if (await sign(payload, secret) !== signature) return null;
  try {
    const data = JSON.parse(decodeBase64Url(payload));
    if (!data.url || !Number.isInteger(data.expires) || data.expires < Math.floor(Date.now() / 1000)) return null;
    return data.url;
  } catch(e) {
    return null;
  }
}

function safeImageUrl(value) {
  let url;
  try { url = new URL(value); } catch(e) { return false; }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (host.includes(':') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false;
  return true;
}

async function fetchImage(imageUrl) {
  let currentUrl = imageUrl;
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (!safeImageUrl(currentUrl)) throw new Error('이미지 주소가 안전하지 않아요');
    const response = await fetch(currentUrl, { redirect: 'manual' });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('Location');
      if (!location || redirects === 3) throw new Error('이미지 주소가 너무 많이 이동했어요');
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }
    if (!response.ok) throw new Error('이미지 사이트에서 파일을 가져오지 못했어요');
    const contentType = (response.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) throw new Error('지원하지 않는 이미지 형식이에요');
    const contentLength = Number(response.headers.get('Content-Length') || 0);
    if (contentLength > MAX_IMAGE_BYTES) throw new Error('이미지가 15MB를 초과해요');
    return response;
  }
  throw new Error('이미지 주소를 확인할 수 없어요');
}

async function readLimitedBody(response) {
  if (!response.body) throw new Error('이미지 내용이 비어 있어요');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw new Error('이미지가 15MB를 초과해요');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Blob(chunks);
}

export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allowedOrigin = env.ALLOWED_ORIGIN || 'https://huntberry1977.github.io';
    const headers = corsHeaders(origin, allowedOrigin);

    if (origin && origin !== allowedOrigin) return jsonResponse({ error: '허용되지 않은 앱 주소입니다.' }, 403, headers);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET') return jsonResponse({ error: '지원하지 않는 요청입니다.' }, 405, headers);

    if (requestUrl.pathname === '/search') {
      const query = (requestUrl.searchParams.get('query') || '').trim();
      if (!query || query.length > 100) return jsonResponse({ error: '검색어를 확인해주세요.' }, 400, headers);
      if (!env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET || !env.IMAGE_TOKEN_SECRET) {
        return jsonResponse({ error: '네이버 검색 서버 설정이 완료되지 않았어요.' }, 503, headers);
      }
      try {
        const naverUrl = new URL('https://openapi.naver.com/v1/search/image.json');
        naverUrl.searchParams.set('query', query);
        naverUrl.searchParams.set('display', '20');
        naverUrl.searchParams.set('sort', 'sim');
        const response = await fetch(naverUrl, {
          headers: {
            'X-Naver-Client-Id': env.NAVER_CLIENT_ID,
            'X-Naver-Client-Secret': env.NAVER_CLIENT_SECRET
          }
        });
        if (!response.ok) return jsonResponse({ error: '네이버 이미지 검색 요청에 실패했어요.' }, 502, headers);
        const data = await response.json();
        const results = [];
        for (const item of (data.items || [])) {
          if (!safeImageUrl(item.link) || !item.thumbnail || !item.thumbnail.startsWith('https://')) continue;
          results.push({
            title: String(item.title || '').replace(/<[^>]*>/g, '').slice(0, 180),
            thumbnail: item.thumbnail,
            token: await makeImageToken(item.link, env.IMAGE_TOKEN_SECRET)
          });
        }
        return jsonResponse({ results }, 200, headers);
      } catch(e) {
        return jsonResponse({ error: '네이버 검색 서버에 연결할 수 없어요.' }, 502, headers);
      }
    }

    if (requestUrl.pathname === '/image') {
      if (!env.IMAGE_TOKEN_SECRET) return jsonResponse({ error: '이미지 서버 설정이 완료되지 않았어요.' }, 503, headers);
      const imageUrl = await readImageToken(requestUrl.searchParams.get('token') || '', env.IMAGE_TOKEN_SECRET);
      if (!imageUrl || !safeImageUrl(imageUrl)) return jsonResponse({ error: '이미지 선택 정보가 만료됐어요. 다시 검색해주세요.' }, 400, headers);
      try {
        const response = await fetchImage(imageUrl);
        const blob = await readLimitedBody(response);
        headers.set('Content-Type', response.headers.get('Content-Type').split(';')[0]);
        headers.set('Cache-Control', 'private, max-age=300');
        headers.set('X-Content-Type-Options', 'nosniff');
        return new Response(blob, { status: 200, headers });
      } catch(e) {
        const status = e.message.includes('15MB') ? 413 : 502;
        return jsonResponse({ error: e.message || '이미지를 내려받지 못했어요.' }, status, headers);
      }
    }

    return jsonResponse({ error: '요청한 주소를 찾을 수 없어요.' }, 404, headers);
  }
};
