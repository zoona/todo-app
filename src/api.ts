import { toTodo, withDue, type RawIssue } from "./parse";
import { SYSTEM_LABEL, type HubFile, type Todo } from "./types";

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

export class AuthError extends Error {}

async function call(path: string, init: RequestInit = {}) {
  const token = getToken();
  if (!token) throw new AuthError("토큰이 없습니다");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (res.status === 401 || res.status === 403) {
    throw new AuthError("토큰이 만료됐거나 권한이 없습니다");
  }
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res;
}

function labelNames(issue: RawIssue): string[] {
  return issue.labels.map((l) => (typeof l === "string" ? l : l.name));
}

export async function fetchTodos(): Promise<Todo[]> {
  const res = await call(`/repos/${REPO}/issues?state=open&per_page=100`);
  const raw = (await res.json()) as RawIssue[];
  return raw
    .filter((i) => !i.pull_request && !labelNames(i).includes(SYSTEM_LABEL))
    .map(toTodo);
}

export async function createTodo(input: {
  title: string;
  category: string | null;
  due: string | null;
}): Promise<void> {
  const labels = input.category ? [input.category] : [];
  const body = withDue("출처: 웹앱", input.due);
  await call(`/repos/${REPO}/issues`, {
    method: "POST",
    body: JSON.stringify({ title: input.title, labels, body }),
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
