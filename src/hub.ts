/**
 * 프로젝트 백로그를 화면에 어떤 순서로 놓을지.
 *
 * 백로그에 수동 순서는 두지 않는다 — 순서를 바꾸려면 HUB 마크다운 줄을 다시
 * 써야 하고, 그러면 그 줄의 git blame이 오늘로 리셋되어 방치 신호가 죽는다.
 * 정리하려고 만든 도구가 정리의 근거를 지우게 된다. 그래서 원본은 그대로 두고
 * 화면에서만 순서를 바꾼다.
 */

import type { BacklogSort } from "./config";
import type { HubProject } from "./types";

const DAY = 86400000;

export function ageDays(date: string | null | undefined, now: number): number {
  return date ? Math.floor((now - Date.parse(date)) / DAY) : 0;
}

export function staleLabel(days: number): string {
  if (days >= 365) return `${Math.floor(days / 365)}년 방치`;
  if (days >= 30) return `${Math.floor(days / 30)}개월 방치`;
  return `${Math.floor(days / 7)}주 방치`;
}

/** 그 프로젝트에서 가장 오래 방치된 항목의 나이. 날짜 없는 항목은 0으로 본다. */
export function staleOf(p: HubProject, now: number): number {
  return Math.max(0, ...p.items.map((i) => ageDays(i.date, now)));
}

/**
 * 방치순은 오래 묵은 프로젝트가 위로 온다 — 주간 정리에서 훑을 순서다.
 * 같은 나이면 이름순으로 갈라 순서가 새로고침마다 흔들리지 않게 한다.
 */
export function sortProjects(
  projects: HubProject[],
  sort: BacklogSort,
  now: number,
): HubProject[] {
  const byName = (a: HubProject, b: HubProject) => a.title.localeCompare(b.title, "ko");
  if (sort === "name") return [...projects].sort(byName);
  return [...projects].sort((a, b) => staleOf(b, now) - staleOf(a, now) || byName(a, b));
}
