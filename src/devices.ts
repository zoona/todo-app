/**
 * 출처 줄을 사람이 읽을 형태로 바꾼다.
 *
 * 이슈 본문에는 hostname 원본이 들어간다. 이름을 나중에 고쳐도 옛 이슈가 같이
 * 따라오게 하려는 것이라, 사람이 읽을 이름으로 바꾸는 건 여기서 한다.
 */

export const DEVICES: Record<string, string> = {
  "Vosne-Romanee": "집 맥",
  lambray: "서피스",
};

const SESSION_MARK = "— 세션";

export type Origin = {
  /** 사람이 읽을 이름. 표에 없으면 hostname 그대로 */
  label: string;
  /** 세션 링크. 없으면 null */
  session: string | null;
};

export function hostLabel(host: string): string {
  const short = host.replace(/\.local$/, "");
  return DEVICES[short] ?? short;
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
