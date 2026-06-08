/**
 * 실뷰 2 — Gemini Vision 프록시 Worker
 * Cloudflare Workers에 붙여넣고, 환경변수 GEMINI_API_KEY 설정
 *
 * 허용 Origin: silview.choshg.com (다른 도메인에서 무단 사용 차단)
 */

const ALLOWED_ORIGINS = [
  'https://silview.choshg.com',
  'http://localhost:5173',   // 로컬 개발용
];

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204, origin);
    }

    // POST만 허용
    if (request.method !== 'POST') {
      return corsResponse(JSON.stringify({ error: 'Method not allowed' }), 405, origin);
    }

    // Origin 검사
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return corsResponse(JSON.stringify({ error: 'Forbidden' }), 403, origin);
    }

    // API 키 확인
    if (!env.GEMINI_API_KEY) {
      return corsResponse(JSON.stringify({ error: 'API key not configured' }), 500, origin);
    }

    try {
      const body = await request.json();

      const geminiResp = await fetch(`${GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await geminiResp.json();
      return corsResponse(JSON.stringify(data), geminiResp.status, origin);
    } catch (err) {
      return corsResponse(JSON.stringify({ error: 'Proxy error', detail: String(err) }), 500, origin);
    }
  },
};

function corsResponse(body, status, origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  return new Response(body, { status, headers });
}
