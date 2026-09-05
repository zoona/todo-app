/**
 * GitHub 로그인의 토큰 교환 중계.
 *
 * GitHub의 토큰 엔드포인트는 브라우저 직접 호출을 막아놨고(CORS 미지원),
 * client_secret은 브라우저에 둘 수 없다. 이 Worker는 그 교환 하나만 한다.
 * 받은 code를 client_secret과 함께 GitHub에 넘기고 access_token만 돌려준다.
 */

const APP_ORIGIN = "https://zoona.github.io";

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": APP_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") {
      return json({ error: "POST만 받습니다" }, 405, cors);
    }

    const { code } = await request.json().catch(() => ({}));
    if (!code) return json({ error: "code가 없습니다" }, 400, cors);

    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: env.CLIENT_ID,
        client_secret: env.CLIENT_SECRET,
        code,
      }),
    });
    const data = await res.json();

    if (data.error) {
      return json({ error: data.error_description || data.error }, 400, cors);
    }
    // access_token만 골라 돌려준다. 나머지 필드는 앱이 쓸 일이 없다.
    return json({ access_token: data.access_token }, 200, cors);
  },
};
