/**
 * 출처 줄을 목록에 보일 형태로 가른다.
 *
 * 장비는 hostname을 그대로 보여준다. 별명으로 바꾸면 표를 계속 손봐야 하고
 * 새 장비는 어차피 표에 없어서 hostname이 나온다. 이름은 소유자가 안다.
 */

const SESSION_MARK = "— 세션";

export type Origin = {
  /** 장비 이름. hostname 그대로, .local만 뗀다 */
  label: string;
  /** 세션 링크. 없으면 null */
  session: string | null;
};

export function hostLabel(host: string): string {
  return host.replace(/\.local$/, "");
}

/** `출처:` 줄의 내용을 (이름, 세션)으로 가른다. */
export function readOrigin(origin: string | null | undefined): Origin | null {
  if (!origin) return null;
  const [host, session] = origin.split(SESSION_MARK);
  const label = hostLabel(host.trim());
  if (!label) return null;
  const url = (session ?? "").trim();
  return { label, session: url.startsWith("http") ? url : null };
}

/** 담은 지 얼마나 됐나. 오래된 것을 눈으로 가리려는 것이라 대략이면 된다. */
export function since(iso: string, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - Date.parse(iso)) / 86400000);
  if (days <= 0) return "오늘";
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days / 7)}주 전`;
  if (days < 365) return `${Math.floor(days / 30)}개월 전`;
  return `${Math.floor(days / 365)}년 전`;
}
