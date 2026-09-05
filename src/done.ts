/**
 * 끝낸 것 모아 보기.
 *
 * 닫으면 화면에서 사라져 버려서, 세션이 자율로 닫은 것을 되짚어 볼 자리가 없었다.
 * 잘못 닫혀도 알 수가 없다는 뜻이라 확인할 자리를 만든다.
 *
 * 두 곳에서 온다. 이슈는 닫힌 것, 프로젝트 백로그는 체크된 것. 둘을 한 줄로 섞어
 * 최근 순으로 놓고, 7일을 기준으로 최근과 그 이전으로 가른다.
 */

import type { HubFile, Todo } from "./types";

export type DoneEntry = {
  key: string;
  title: string;
  /** 완료 시각. 없으면 언제인지 모르는 것 */
  at: string | null;
  /** 이슈에서 왔으면 되돌릴 수 있다. 백로그 항목은 다른 repo라 앱이 못 고친다. */
  todo?: Todo;
  /** 백로그에서 왔으면 그 프로젝트 */
  project?: { slug: string; title: string };
};

const DAY = 86400000;
export const RECENT_DAYS = 7;

export function fromTodos(closed: Todo[]): DoneEntry[] {
  return closed.map((t) => ({
    key: `issue-${t.number}`,
    title: t.title,
    at: t.closedAt,
    todo: t,
  }));
}

export function fromHub(hub: HubFile | null): DoneEntry[] {
  if (!hub) return [];
  return hub.projects.flatMap((p) =>
    (p.done ?? []).map((d, i) => ({
      key: `hub-${p.slug}-${i}`,
      title: d.text,
      at: d.date ?? null,
      project: { slug: p.slug, title: p.title },
    })),
  );
}

/**
 * 최근 순으로 놓고 7일에서 가른다. 날짜를 모르는 것은 뒤(오래된 쪽)로 보낸다 —
 * 최근이라고 우겨서 위에 올리면 최근 목록을 못 믿게 된다.
 */
export function splitByRecency(
  entries: DoneEntry[],
  now: number,
): { recent: DoneEntry[]; older: DoneEntry[] } {
  const sorted = [...entries].sort((a, b) => {
    if (!a.at && !b.at) return a.title.localeCompare(b.title, "ko");
    if (!a.at) return 1;
    if (!b.at) return -1;
    return Date.parse(b.at) - Date.parse(a.at);
  });
  const cutoff = now - RECENT_DAYS * DAY;
  const recent = sorted.filter((e) => e.at && Date.parse(e.at) >= cutoff);
  const older = sorted.filter((e) => !e.at || Date.parse(e.at) < cutoff);
  return { recent, older };
}
