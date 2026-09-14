/**
 * 세션 현황.
 *
 * 세션이 여러 장비에 흩어져 있어 무엇이 도는지 보려면 하나씩 열어봐야 했다.
 * 커밋 trailer의 세션 링크와 이슈 출처 줄이 같은 세션을 가리켜서, 한 세션이
 * 만든 커밋과 담은 할 일을 한 줄로 묶을 수 있다. 묶는 일은 워크플로가 하고
 * 여기서는 보여줄 모양만 만든다.
 *
 * 할 일 목록은 여기서 다시 그리지 않는다. 그 세션이 담은 할 일은 개수와 번호로만
 * 잇고 본체는 할 일 화면이 주인이다. 두 군데서 그리면 어느 쪽이 맞는지 헷갈린다.
 */

import type { SessionEntry } from "./types";

const DAY = 86400000;
/** 이보다 오래 조용하면 끝난 세션으로 본다. 하루를 넘기면 이어서 하는 일이 아니다. */
export const QUIET_DAYS = 1;

/** 마지막 활동이 언제였나. 없으면 모르는 것이라 null. */
export function idleDays(entry: SessionEntry, now: number): number | null {
  if (!entry.lastAt) return null;
  const at = Date.parse(entry.lastAt);
  if (Number.isNaN(at)) return null;
  return Math.floor((now - at) / DAY);
}

/** 최근 움직인 것과 조용해진 것을 가른다. 순서는 워크플로가 준 대로 둔다. */
export function splitByActivity(
  entries: SessionEntry[],
  now: number,
): { active: SessionEntry[]; quiet: SessionEntry[] } {
  const active: SessionEntry[] = [];
  const quiet: SessionEntry[] = [];
  for (const e of entries) {
    const days = idleDays(e, now);
    if (days !== null && days < QUIET_DAYS) active.push(e);
    else quiet.push(e);
  }
  return { active, quiet };
}

/**
 * 그 세션이 무엇을 건드렸나 한 줄로. 많으면 앞의 둘만 보이고 나머지는 개수로 접는다.
 * 프로젝트 이름이 길어서 다 늘어놓으면 정작 무슨 일이었는지가 안 보인다.
 */
export function projectSummary(entry: SessionEntry, limit = 2): string {
  if (entry.projects.length === 0) return "";
  const head = entry.projects.slice(0, limit).map((p) => `${p.slug} ${p.count}`);
  const rest = entry.projects.length - head.length;
  return rest > 0 ? `${head.join(", ")} 외 ${rest}` : head.join(", ");
}

/** 목록에 보일 장비 이름. 이슈를 안 담은 세션은 장비를 모른다. */
export function hostLabel(entry: SessionEntry): string {
  return entry.host ?? "장비 모름";
}

/** 목록에 보일 도구 이름. 무엇으로 한 작업인지 한눈에 갈리게 한다. */
export function toolLabel(entry: SessionEntry): string {
  return entry.tool === "codex" ? "Codex" : "Claude";
}
