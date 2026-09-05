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
 * 방치가 오래된 프로젝트가 위로 온다 — 주간 정리에서 훑을 순서다.
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

/**
 * 항목을 앞머리와 상세로 가른다.
 *
 * HUB 항목은 대개 "앞머리 — 상세", "앞머리: 상세", "앞머리 (부연)" 꼴로 쓰여 있다.
 * 긴 항목을 통째로 보여주면 문단이 20개 늘어서 훑을 수가 없다. 앞머리만 본문 색으로
 * 띄우고 상세는 흐리게 붙이면 목록으로 읽힌다. 짧은 항목은 가르지 않는다.
 */
const SEPARATOR = /\s+—\s+|:\s+|\s+(?=\()|\.\s+/;
const SHORT_ENOUGH = 45;
const HEAD_MIN = 3;

export function splitItem(text: string): { head: string; rest: string } {
  if (text.length <= SHORT_ENOUGH) return { head: text, rest: "" };
  const m = SEPARATOR.exec(text);
  if (!m || m.index < HEAD_MIN || m.index > SHORT_ENOUGH) return { head: text, rest: "" };
  return {
    head: text.slice(0, m.index).trim(),
    rest: text.slice(m.index + m[0].length).trim(),
  };
}
