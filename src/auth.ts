/**
 * GitHub 로그인 흐름.
 *
 * 버튼 → github.com 승인 → 콜백 ?code=...&state=... → Worker에서 토큰 교환.
 * state는 콜백 위조를 막는 난수다. 로그인 시작 때 sessionStorage에 두고
 * 콜백에서 대조한 뒤 지운다.
 */

import { AUTH } from "./auth-config";

const STATE_KEY = "todo.oauth-state";

/** GitHub App 등록 전에는 값이 비어 있고, 그동안 로그인 버튼은 숨긴다. */
export function loginReady(): boolean {
  return AUTH.clientId.length > 0 && AUTH.workerUrl.length > 0;
}

export function startLogin() {
  const state = crypto.randomUUID();
  sessionStorage.setItem(STATE_KEY, state);
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", AUTH.clientId);
  url.searchParams.set("state", state);
  location.assign(url.toString());
}

export type Callback = { code: string; state: string };

/** 콜백 URL에서 code와 state를 뽑는다. 로그인 콜백이 아니면 null. */
export function parseCallback(search: string): Callback | null {
  const params = new URLSearchParams(search);
  const code = params.get("code");
  const state = params.get("state");
  return code && state ? { code, state } : null;
}

/** 저장해둔 state와 대조하고 지운다. 일치할 때만 true. */
export function consumeState(state: string): boolean {
  const saved = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  return saved !== null && saved === state;
}

/** code를 Worker로 보내 토큰을 받는다. */
export async function exchangeCode(code: string): Promise<string> {
  const res = await fetch(AUTH.workerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error ?? `로그인 교환 실패 (${res.status})`);
  }
  return data.access_token;
}

/** 주소창에서 code와 state를 지운다. 새로고침 때 재교환을 막는다. */
export function cleanCallbackUrl() {
  const url = new URL(location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  history.replaceState(null, "", url.pathname + url.search + url.hash);
}

const TOKEN_MSG = "todo-token";

/** 다른 화면(위키 홈 등) 안에 들어가 있는지. GitHub 로그인 화면은 그 안에서 열리지 않는다. */
export function inFrame(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

/**
 * 화면 안에 들어가 있을 때의 로그인. 새 창에서 평소대로 로그인하고,
 * 그 창이 토큰을 이쪽으로 넘겨준다. 같은 출처에서 온 메시지만 받는다.
 */
export function startLoginPopup(onToken: (token: string) => void) {
  const handler = (e: MessageEvent) => {
    const data = e.data as { type?: string; token?: unknown } | null;
    if (e.origin !== location.origin || data?.type !== TOKEN_MSG || typeof data.token !== "string") return;
    window.removeEventListener("message", handler);
    onToken(data.token);
  };
  window.addEventListener("message", handler);
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set("login", "popup");
  window.open(url.toString(), "todo-login", "width=520,height=720");
}

/** 새 창 로그인으로 열린 페이지인지. */
export function isPopupLogin(search: string): boolean {
  return new URLSearchParams(search).get("login") === "popup";
}

/** 새 창 로그인이 끝났으면 연 쪽에 토큰을 넘기고 창을 닫는다. 넘겼으면 true. */
export function handOverToken(token: string): boolean {
  if (!window.opener || window.opener === window) return false;
  window.opener.postMessage({ type: TOKEN_MSG, token }, location.origin);
  window.close();
  return true;
}
