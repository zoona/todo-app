import { HIGH, LOW, PRIORITY_RANK, UNSORTED, type Priority, type Todo } from "./types";

const DUE_PREFIX = "마감:";
const ORIGIN_PREFIX = "출처:";
const PROJECT_PREFIX = "프로젝트:";

// 날짜만이거나 날짜와 시간. 시간은 24시간제.
const DUE_FORMAT = /^\d{4}-\d{2}-\d{2}( ([01]\d|2[0-3]):[0-5]\d)?$/;

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

/** 접두어 줄을 넣거나 바꾸거나 뺀 본문. 다른 줄은 건드리지 않는다. */
function withField(body: string, prefix: string, value: string | null): string {
  const kept = body.split("\n").filter((line) => !line.trim().startsWith(prefix));
  while (kept.length && kept[kept.length - 1].trim() === "") kept.pop();
  if (!value) return kept.join("\n");
  const line = `${prefix} ${value}`;
  return kept.length ? [...kept, "", line].join("\n") : line;
}

export function parseDue(body: string | null | undefined): string | null {
  const value = fieldLine(body, DUE_PREFIX);
  return value && DUE_FORMAT.test(value) ? value : null;
}

export function parseOrigin(body: string | null | undefined): string | null {
  return fieldLine(body, ORIGIN_PREFIX);
}

export function parseProject(body: string | null | undefined): string | null {
  return fieldLine(body, PROJECT_PREFIX);
}

export function withDue(body: string, due: string | null): string {
  return withField(body, DUE_PREFIX, due);
}

export function withProject(body: string, project: string | null): string {
  return withField(body, PROJECT_PREFIX, project);
}

/** 설정의 카테고리 순서대로 첫 매칭. 카테고리 목록은 설정 이슈가 정본이다. */
export function categoryOf(labels: string[], categories: string[]): string {
  return categories.find((c) => labels.includes(c)) ?? UNSORTED;
}

export function priorityOf(labels: string[]): Priority {
  if (labels.includes(HIGH)) return "높음";
  if (labels.includes(LOW)) return "낮음";
  return "보통";
}

export type RawIssue = {
  number: number;
  title: string;
  html_url: string;
  body: string | null;
  labels: ({ name: string } | string)[];
  created_at?: string;
  closed_at?: string | null;
  pull_request?: unknown;
};

export function toTodo(issue: RawIssue, categories: string[]): Todo {
  const labels = issue.labels.map((l) => (typeof l === "string" ? l : l.name));
  return {
    number: issue.number,
    title: issue.title,
    url: issue.html_url,
    category: categoryOf(labels, categories),
    priority: priorityOf(labels),
    project: parseProject(issue.body),
    inProgress: labels.includes("진행중"),
    due: parseDue(issue.body),
    origin: parseOrigin(issue.body),
    createdAt: issue.created_at ?? "",
    closedAt: issue.closed_at ?? null,
    body: issue.body ?? "",
  };
}

export type DueState = "overdue" | "today" | "soon" | "later" | null;

/** 마감의 날짜 부분만. 시간이 붙어 있어도 날짜로 비교한다. */
export function dueDate(due: string): string {
  return due.slice(0, 10);
}

export function dueState(due: string | null, today: string): DueState {
  if (!due) return null;
  const date = dueDate(due);
  if (date < today) return "overdue";
  if (date === today) return "today";
  const days = (Date.parse(date) - Date.parse(today)) / 86400000;
  return days <= 7 ? "soon" : "later";
}

/** 지난 것, 오늘, 그다음 우선순위, 같으면 마감이 가까운 순. 마감 없는 건 뒤로. */
export function compareTodos(a: Todo, b: Todo, today: string): number {
  const urgency = (t: Todo) => {
    const state = dueState(t.due, today);
    if (state === "overdue") return 0;
    if (state === "today") return 1;
    return 2;
  };
  const byUrgency = urgency(a) - urgency(b);
  if (byUrgency) return byUrgency;

  const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (byPriority) return byPriority;

  if (a.due && b.due) return a.due.localeCompare(b.due);
  if (a.due) return -1;
  if (b.due) return 1;
  return a.number - b.number;
}

export function todayInSeoul(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
