import { toTodo, withDue, withProject, type RawIssue } from "./parse";
import {
  parseSubscriptions,
  remove,
  renderSubscriptions,
  upsert,
  type PushSubscriptionRecord,
} from "./push";
import { SYSTEM_LABEL, UNSORTED, type HubFile, type Priority, type Todo } from "./types";

const REPO = "zoona/todo";
const API = "https://api.github.com";
const TOKEN_KEY = "todo.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token.trim());
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** 토큰을 다시 받아야 하는 상태. 401, 403, 그리고 repo가 안 보이는 404. */
export class AuthError extends ApiError {}

async function call(path: string, init: RequestInit = {}) {
  const token = getToken();
  if (!token) throw new AuthError(401, "토큰이 없습니다");
  const res = await fetch(`${API}${path}`, {
    ...init,
    // GitHub API 응답에 max-age=60이 붙어서 방금 담은 것이 새로고침에도 60초간
    // 안 보였다. 할 일 앱은 항상 현재 상태를 보여야 하므로 HTTP 캐시를 끈다.
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) {
    // GitHub가 준 이유를 그대로 보여준다. 내 문구로 덮으면 무엇이 틀렸는지 모른다.
    const detail = (await res.json().catch(() => null)) as { message?: string } | null;
    const reason = detail?.message ?? res.statusText;
    if (res.status === 401 || res.status === 403) {
      throw new AuthError(res.status, `${res.status} ${reason}`);
    }
    throw new ApiError(res.status, `${res.status} ${reason}`);
  }
  return res;
}

function labelNames(issue: RawIssue): string[] {
  return issue.labels.map((l) => (typeof l === "string" ? l : l.name));
}

export async function fetchTodos(): Promise<Todo[]> {
  // repo가 안 보이는 404는 토큰이 그 repo를 못 보는 것이다. 여기서만 인증 오류로 올린다.
  const res = await call(`/repos/${REPO}/issues?state=open&per_page=100`).catch((err) => {
    if (err instanceof ApiError && err.status === 404) {
      throw new AuthError(404, `토큰이 ${REPO}를 못 봅니다. 만들 때 그 repo를 골랐는지, 권한에 Issues를 넣었는지 확인하세요.`);
    }
    throw err;
  });
  const raw = (await res.json()) as RawIssue[];
  return raw
    .filter(
      (i) =>
        !i.pull_request &&
        !labelNames(i).includes(SYSTEM_LABEL) &&
        !labelNames(i).includes(PUSH_LABEL),
    )
    .map(toTodo);
}

export async function createTodo(input: {
  title: string;
  category: string | null;
  priority: Priority;
  project: string | null;
  due: string | null;
}): Promise<void> {
  const labels = [input.category, input.priority === "보통" ? null : input.priority].filter(
    (x): x is string => !!x,
  );
  let body = withProject("출처: 웹앱", input.project);
  body = withDue(body, input.due);
  await call(`/repos/${REPO}/issues`, {
    method: "POST",
    body: JSON.stringify({ title: input.title, labels, body }),
  });
}

export async function setPriority(todo: Todo, priority: Priority): Promise<void> {
  const keep = [todo.category === UNSORTED ? null : todo.category, todo.inProgress ? "진행중" : null];
  const labels = [...keep, priority === "보통" ? null : priority].filter(
    (x): x is string => !!x,
  );
  await call(`/repos/${REPO}/issues/${todo.number}/labels`, {
    method: "PUT",
    body: JSON.stringify({ labels }),
  });
}

export async function closeTodo(number: number): Promise<void> {
  await call(`/repos/${REPO}/issues/${number}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "closed" }),
  });
}

export async function setDue(todo: Todo, due: string | null): Promise<void> {
  await call(`/repos/${REPO}/issues/${todo.number}`, {
    method: "PATCH",
    body: JSON.stringify({ body: withDue(todo.body, due) }),
  });
}

export async function setCategory(number: number, category: string): Promise<void> {
  await call(`/repos/${REPO}/issues/${number}/labels`, {
    method: "PUT",
    body: JSON.stringify({ labels: [category] }),
  });
}

const PUSH_LABEL = "push";

/** 구독을 담아둔 이슈. 없으면 만든다. */
async function pushIssue(): Promise<{ number: number; body: string }> {
  const res = await call(
    `/repos/${REPO}/issues?state=open&labels=${encodeURIComponent(PUSH_LABEL)}&per_page=1`,
  );
  const found = (await res.json()) as RawIssue[];
  if (found.length) return { number: found[0].number, body: found[0].body ?? "" };

  const created = await call(`/repos/${REPO}/issues`, {
    method: "POST",
    body: JSON.stringify({
      title: "알림 구독",
      labels: [PUSH_LABEL],
      body: renderSubscriptions([]),
    }),
  });
  const issue = (await created.json()) as RawIssue;
  return { number: issue.number, body: issue.body ?? "" };
}

export async function readSubscriptions(): Promise<PushSubscriptionRecord[]> {
  const issue = await pushIssue();
  return parseSubscriptions(issue.body);
}

export async function saveSubscription(record: PushSubscriptionRecord): Promise<void> {
  const issue = await pushIssue();
  const next = upsert(parseSubscriptions(issue.body), record);
  await call(`/repos/${REPO}/issues/${issue.number}`, {
    method: "PATCH",
    body: JSON.stringify({ body: renderSubscriptions(next, issue.body) }),
  });
}

export async function dropSubscription(endpoint: string): Promise<void> {
  const issue = await pushIssue();
  const next = remove(parseSubscriptions(issue.body), endpoint);
  await call(`/repos/${REPO}/issues/${issue.number}`, {
    method: "PATCH",
    body: JSON.stringify({ body: renderSubscriptions(next, issue.body) }),
  });
}

export async function fetchHub(): Promise<HubFile | null> {
  try {
    const res = await call(`/repos/${REPO}/contents/hub.json`, {
      headers: { Accept: "application/vnd.github.raw+json" },
    });
    return (await res.json()) as HubFile;
  } catch (err) {
    if (err instanceof AuthError) throw err;
    return null; // 파일이 아직 없으면 HUB 섹션만 비운다
  }
}
