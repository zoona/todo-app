import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AuthError,
  clearToken,
  closeTodo,
  createTodo,
  fetchHub,
  fetchTodos,
  getToken,
  setPriority,
  setToken,
} from "./api";
import { compareTodos, dueState, todayInSeoul } from "./parse";
import {
  CATEGORIES,
  UNSORTED,
  type HubFile,
  type Priority,
  type Todo,
} from "./types";
import "./App.css";

const SECTIONS = [...CATEGORIES, UNSORTED];

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [todos, setTodos] = useState<Todo[]>([]);
  const [hub, setHub] = useState<HubFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const today = todayInSeoul();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, hubFile] = await Promise.all([fetchTodos(), fetchHub()]);
      setTodos(list);
      setHub(hubFile);
      localStorage.setItem("todo.cache", JSON.stringify({ list, hubFile }));
    } catch (err) {
      if (err instanceof AuthError) {
        setAuthed(false);
        clearToken();
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : String(err));
        const cached = localStorage.getItem("todo.cache");
        if (cached) {
          const { list, hubFile } = JSON.parse(cached);
          setTodos(list);
          setHub(hubFile);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) void load();
  }, [authed, load]);

  const sorted = useMemo(
    () => [...todos].sort((a, b) => compareTodos(a, b, today)),
    [todos, today],
  );

  if (!authed) {
    return <TokenGate onSaved={() => setAuthed(true)} error={error} />;
  }

  const urgent = sorted.filter((t) => {
    const s = dueState(t.due, today);
    return s === "overdue" || s === "today";
  });

  return (
    <div className="app">
      <header>
        <h1>할 일</h1>
        <button className="ghost" onClick={() => void load()} disabled={loading}>
          {loading ? "..." : "새로고침"}
        </button>
      </header>

      {error && <p className="error">{error}</p>}

      <AddForm today={today} hub={hub} onAdded={() => void load()} />

      {urgent.length > 0 && (
        <section className="urgent">
          <h2>지금 볼 것</h2>
          {urgent.map((t) => (
            <Row key={t.number} todo={t} today={today} onChanged={() => void load()} />
          ))}
        </section>
      )}

      {SECTIONS.map((name) => {
        const rows = sorted.filter((t) => t.category === name);
        if (!rows.length) return null;
        return (
          <section key={name}>
            <h2>
              {name} <span className="count">{rows.length}</span>
            </h2>
            {rows.map((t) => (
              <Row key={t.number} todo={t} today={today} onChanged={() => void load()} />
            ))}
          </section>
        );
      })}

      {hub && hub.projects.length > 0 && <HubSection hub={hub} />}

      <footer>
        <button
          className="ghost"
          onClick={() => {
            clearToken();
            setAuthed(false);
          }}
        >
          토큰 지우기
        </button>
      </footer>
    </div>
  );
}

function TokenGate({ onSaved, error }: { onSaved: () => void; error: string | null }) {
  const [value, setValue] = useState("");
  return (
    <div className="app gate">
      <h1>할 일</h1>
      <p>
        <code>zoona/todo</code> 하나만 고른 fine-grained 토큰을 붙여넣으세요. 권한은
        Issues 읽기·쓰기와 Contents 읽기. 이 브라우저에만 저장됩니다.
      </p>
      {error && <p className="error">{error}</p>}
      <input
        type="password"
        value={value}
        placeholder="github_pat_..."
        onChange={(e) => setValue(e.target.value)}
      />
      <button
        className="primary"
        disabled={!value.trim()}
        onClick={() => {
          setToken(value);
          onSaved();
        }}
      >
        저장
      </button>
    </div>
  );
}

function AddForm({
  today,
  hub,
  onAdded,
}: {
  today: string;
  hub: HubFile | null;
  onAdded: () => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("개인");
  const [priority, setPriorityValue] = useState<Priority>("보통");
  const [project, setProject] = useState("");
  const [due, setDue] = useState("");
  const [withTime, setWithTime] = useState(false);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await createTodo({
        title: title.trim(),
        category,
        priority,
        project: project || null,
        due: due ? due.replace("T", " ") : null,
      });
      setTitle("");
      setDue("");
      setProject("");
      setPriorityValue("보통");
      setMore(false);
      onAdded();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="add" onSubmit={submit}>
      <input
        value={title}
        placeholder="무엇을?"
        onChange={(e) => setTitle(e.target.value)}
        enterKeyHint="done"
      />

      <div className="chips">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={category === c ? "chip on" : "chip"}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
        <button
          type="button"
          className="chip more"
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
        >
          {more ? "접기" : "더"}
        </button>
      </div>

      {more && (
        <div className="more-fields">
          <div className="chips">
            {(["높음", "보통", "낮음"] as Priority[]).map((p) => (
              <button
                key={p}
                type="button"
                className={priority === p ? "chip on" : "chip"}
                onClick={() => setPriorityValue(p)}
              >
                {p}
              </button>
            ))}
          </div>

          <select value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">프로젝트 없음</option>
            {hub?.projects.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.title}
              </option>
            ))}
          </select>

          <div className="due-row">
            <input
              type={withTime ? "datetime-local" : "date"}
              value={due}
              min={withTime ? `${today}T00:00` : today}
              onChange={(e) => setDue(e.target.value)}
            />
            <button
              type="button"
              className={withTime ? "chip on" : "chip"}
              onClick={() => {
                setWithTime((v) => !v);
                setDue("");
              }}
            >
              시간
            </button>
          </div>
        </div>
      )}

      <button className="primary" type="submit" disabled={busy || !title.trim()}>
        {busy ? "담는 중" : "담기"}
      </button>
    </form>
  );
}

function Row({
  todo,
  today,
  onChanged,
}: {
  todo: Todo;
  today: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const state = dueState(todo.due, today);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const nextPriority: Priority =
    todo.priority === "보통" ? "높음" : todo.priority === "높음" ? "낮음" : "보통";

  return (
    <div className={busy ? "row busy" : "row"}>
      <button
        className="check"
        onClick={() => void run(() => closeTodo(todo.number))}
        aria-label="완료"
        disabled={busy}
      />
      <div className="body">
        <a href={todo.url} target="_blank" rel="noreferrer">
          {todo.title}
        </a>
        <div className="meta">
          <button
            className={`prio p${todo.priority}`}
            disabled={busy}
            onClick={() => void run(() => setPriority(todo, nextPriority))}
            title="눌러서 바꾸기"
          >
            {todo.priority}
          </button>
          {todo.project && <span className="tag">{todo.project}</span>}
          {todo.inProgress && <span className="tag">진행중</span>}
          {state && <span className={`due ${state}`}>{dueLabel(todo.due!, state)}</span>}
        </div>
      </div>
    </div>
  );
}

function dueLabel(due: string, state: NonNullable<ReturnType<typeof dueState>>) {
  const time = due.length > 10 ? ` ${due.slice(11)}` : "";
  if (state === "overdue") return `${due} 지남`;
  if (state === "today") return `오늘${time}`;
  return due;
}

function HubSection({ hub }: { hub: HubFile }) {
  return (
    <section className="hub">
      <h2>프로젝트 남은 일</h2>
      {hub.projects.map((p) => (
        <details key={p.slug}>
          <summary>
            {p.title} <span className="count">{p.items.length}</span>
          </summary>
          <ul>
            {p.items.map((item, i) => (
              <li key={i} style={{ marginLeft: item.depth * 12 }}>
                {item.text}
              </li>
            ))}
          </ul>
        </details>
      ))}
      <p className="stamp">
        {hub.drawnAt} 기준 · 커밋 {hub.commit} ({hub.commitDate})
      </p>
    </section>
  );
}
