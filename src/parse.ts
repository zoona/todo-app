import { CATEGORIES, UNSORTED, type Category, type Todo } from "./types";

const DUE_PREFIX = "마감:";
const ORIGIN_PREFIX = "출처:";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 본문에서 접두어로 시작하는 줄의 내용을 뽑는다. */
function fieldLine(body: string | null | undefined, prefix: string): string | null {
  if (!body) return null;
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (line.startsWith(prefix)) {
      const rest = line.slice(prefix.length).trim();
      return rest || null;
    }
  }
  return null;
}

export function parseDue(body: string | null | undefined): string | null {
  const value = fieldLine(body, DUE_PREFIX);
  return value && DATE.test(value) ? value : null;
}

export function parseOrigin(body: string | null | undefined): string | null {
  return fieldLine(body, ORIGIN_PREFIX);
}

/** 마감 줄을 넣거나 바꾸거나 뺀 본문을 돌려준다. 다른 줄은 건드리지 않는다. */
export function withDue(body: string, due: string | null): string {
  const kept = body
    .split("\n")
    .filter((line) => !line.trim().startsWith(DUE_PREFIX));
  while (kept.length && kept[kept.length - 1].trim() === "") kept.pop();
  if (!due) return kept.join("\n");
  // 본문이 비어 있으면 앞에 빈 줄을 두지 않는다.
  return kept.length ? [...kept, "", `${DUE_PREFIX} ${due}`].join("\n") : `${DUE_PREFIX} ${due}`;
}

export function categoryOf(labels: string[]): Category | typeof UNSORTED {
  const hit = CATEGORIES.find((c) => labels.includes(c));
  return hit ?? UNSORTED;
}

export type RawIssue = {
  number: number;
  title: string;
  html_url: string;
  body: string | null;
  labels: ({ name: string } | string)[];
  pull_request?: unknown;
};

export function toTodo(issue: RawIssue): Todo {
  const labels = issue.labels.map((l) => (typeof l === "string" ? l : l.name));
  return {
    number: issue.number,
    title: issue.title,
    url: issue.html_url,
    category: categoryOf(labels),
    inProgress: labels.includes("진행중"),
    due: parseDue(issue.body),
    origin: parseOrigin(issue.body),
    body: issue.body ?? "",
  };
}

export type DueState = "overdue" | "today" | "soon" | "later" | null;

/** 마감을 오늘 기준으로 분류한다. today는 YYYY-MM-DD. */
export function dueState(due: string | null, today: string): DueState {
  if (!due) return null;
  if (due < today) return "overdue";
  if (due === today) return "today";
  const days = (Date.parse(due) - Date.parse(today)) / 86400000;
  return days <= 7 ? "soon" : "later";
}

export function todayInSeoul(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
