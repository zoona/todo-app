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
 * 이 백로그 항목이 이미 실행 줄로 올라갔는지.
 *
 * 같은 프로젝트에 붙은 이슈 중 제목이 앞머리와 같은 것이 있으면 끌어온 것으로 본다.
 * 줄 번호로 묶지 않는 이유는 HUB 문서를 고칠 때마다 번호가 밀려서다. 대신 문구를
 * 다듬으면 연결이 끊기는데, 그때는 다시 끌어오면 되고 잘못 끌어왔으면 이슈만 닫으면 된다.
 */
export function isPulled(
  head: string,
  slug: string,
  todos: { title: string; project: string | null }[],
): boolean {
  return todos.some((t) => t.project === slug && t.title === head);
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

/** 구분자 위치. 앞머리가 너무 짧거나 구분자가 늦게 오면 안 가른다. */
function cut(text: string): { end: number; restAt: number } | null {
  const m = SEPARATOR.exec(text);
  if (!m || m.index < HEAD_MIN || m.index > SHORT_ENOUGH) return null;
  return { end: m.index, restAt: m.index + m[0].length };
}

export function splitItem(text: string): { head: string; rest: string } {
  if (text.length <= SHORT_ENOUGH) return { head: text, rest: "" };
  const c = cut(text);
  if (!c) return { head: text, rest: "" };
  return { head: text.slice(0, c.end).trim(), rest: text.slice(c.restAt).trim() };
}

/**
 * 끌어올 때 쓸 이슈 제목.
 *
 * 화면용 splitItem과 달리 길이를 안 따진다. 짧은 항목이라고 상세까지 제목에 넣으면
 * 목록에서 그 줄만 길어지고, 나중에 상세를 다듬는 순간 제목이 달라져 연결도 끊긴다.
 */
export function pullTitle(text: string): string {
  const c = cut(text);
  return c ? text.slice(0, c.end).trim() : text;
}
