/**
 * 화면을 나누는 기준.
 *
 * 목록 하나에 60건이 세로로 쌓이자 업무 아래의 개인, 아이디어, 이어가기가 화면
 * 밖으로 밀려 안 보였다. 쓰임새별로 가른다 — 오늘 손댈 것, 세션으로 이어 갈 것,
 * 오래 묵어 정리할 것, 주마다 새로 열리는 정기 할 일.
 */

import { dueState } from "./parse";
import type { Todo } from "./types";

export const CONTINUE = "이어가기";
export const STALE_DAYS = 30;
const DAY = 86400000;

/** 정기 할 일 제목 끝의 기간. reminders.yml이 "(2026-W47)", "(2026-11)"을 붙인다 */
const PERIOD = /^(.+?)\s*\((\d{4}-W\d{2}|\d{4}-\d{2})\)$/;

export function recurringOf(title: string): { base: string; period: string } | null {
  const m = PERIOD.exec(title.trim());
  return m ? { base: m[1].trim(), period: m[2] } : null;
}

export type RecurringGroup = { base: string; items: Todo[] };

/** 정기 할 일을 제목으로 묶는다. 기간 순으로 놓아 마지막이 이번 기간이다 */
export function splitRecurring(todos: Todo[]): { singles: Todo[]; groups: RecurringGroup[] } {
  const singles: Todo[] = [];
  const map = new Map<string, Todo[]>();
  for (const t of todos) {
    const r = recurringOf(t.title);
    if (!r) {
      singles.push(t);
      continue;
    }
    map.set(r.base, [...(map.get(r.base) ?? []), t]);
  }
  const groups = [...map.entries()].map(([base, items]) => ({
    base,
    items: items.sort((a, b) =>
      recurringOf(a.title)!.period.localeCompare(recurringOf(b.title)!.period),
    ),
  }));
  return { singles, groups };
}

export function periodLabel(title: string): string {
  const p = (recurringOf(title)?.period ?? "").replace(/^\d{4}-/, "");
  return /^\d{2}$/.test(p) ? `${Number(p)}월` : p;
}

/** 프로젝트 이름의 앞부분. "Deck Engine — 주제를 가리지 않는 발표 엔진"은 줄 안에서 너무 길다 */
export function shortTitle(title: string): string {
  return title.replace(/\*\*/g, "").split(/\s+—\s+/)[0].trim();
}

export function daysSince(iso: string, now: number): number {
  return iso ? Math.floor((now - Date.parse(iso)) / DAY) : 0;
}

/** 오늘 볼 것: 마감이 지났거나 일주일 안, 높음, 진행중 */
export function isToday(t: Todo, today: string): boolean {
  const s = dueState(t.due, today);
  return s === "overdue" || s === "today" || s === "soon" || t.priority === "높음" || t.inProgress;
}

/**
 * 정리 후보: 한 달 넘게 아무도 손대지 않았고, 마감도 없고, 진행중도 아닌 것.
 * 정기 할 일과 이어가기는 따로 다룬다.
 */
export function isStale(t: Todo, now: number): boolean {
  if (t.category === CONTINUE || t.due || t.inProgress) return false;
  if (recurringOf(t.title)) return false;
  return daysSince(t.updatedAt || t.createdAt, now) >= STALE_DAYS;
}

export type Band = "이번 주" | "이번 달" | "그 이전";
export const BANDS: Band[] = ["이번 주", "이번 달", "그 이전"];

/** 담은 시점으로 가른다. 오래된 쪽은 접어 둔다 */
export function bandOf(t: Todo, now: number): Band {
  const d = daysSince(t.createdAt, now);
  if (d < 7) return "이번 주";
  if (d < STALE_DAYS) return "이번 달";
  return "그 이전";
}

const FIELD = /^(출처|프로젝트|마감|완료 조건):/;

/** 본문 첫 줄. 이슈를 열지 않고 무슨 일인지 알 수 있게 */
export function summaryOf(body: string): string {
  const line = body
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !FIELD.test(l) && !l.startsWith("- "));
  return line ?? "";
}

/** 펼쳤을 때 보여 줄 본문 덩어리 */
export type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "ul"; items: string[] };

// 출처, 프로젝트, 마감은 줄 아래 표시와 링크로 이미 보여서 본문에서는 뺀다.
const META = /^(출처|프로젝트|마감):/;

/**
 * 본문 전체를 문단, 굵은 줄 제목, 불릿 목록으로 나눈다.
 * 첫 줄만 보여 주던 때는 회의용 할 일의 공유, 정할 것 불릿이 앱에서 안 보였다.
 */
export function detailOf(body: string): Block[] {
  const blocks: Block[] = [];
  let list: string[] | null = null;
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line || META.test(line) || line.startsWith("<!--")) {
      list = null;
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      if (!list) {
        list = [];
        blocks.push({ kind: "ul", items: list });
      }
      list.push(bullet[1]);
      continue;
    }
    list = null;
    const heading = line.match(/^\*\*(.+)\*\*$/) ?? line.match(/^#{1,6}\s+(.*)$/);
    blocks.push(heading ? { kind: "h", text: heading[1] } : { kind: "p", text: line });
  }
  return blocks;
}

/** 굵게, 링크, 맨 주소만 가른다. 나머지는 글자 그대로 */
export type Span = { kind: "text" | "bold"; text: string } | { kind: "link"; text: string; href: string };

const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)]+)/g;

export function spansOf(text: string): Span[] {
  const out: Span[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: "text", text: text.slice(last, at) });
    if (m[1] !== undefined) out.push({ kind: "bold", text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: "link", text: m[2], href: m[3] });
    else out.push({ kind: "link", text: m[4], href: m[4] });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}
