import { useCallback, useEffect, useState } from "react";
import {
  AuthError,
  clearToken,
  closeTodo,
  createTodo,
  fetchHub,
  fetchTodos,
  getToken,
  setToken,
} from "./api";
import { dueState, todayInSeoul } from "./parse";
import { CATEGORIES, UNSORTED, type HubFile, type Todo } from "./types";
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

  if (!authed) {
    return <TokenGate onSaved={() => setAuthed(true)} error={error} />;
  }

  const open = todos.filter((t) => t.category !== undefined);
  const overdue = open.filter((t) => dueState(t.due, today) === "overdue");
  const dueToday = open.filter((t) => dueState(t.due, today) === "today");

  return (
    <div className="app">
      <header>
        <h1>할 일</h1>
        <button className="ghost" onClick={() => void load()} disabled={loading}>
          {loading ? "..." : "새로고침"}
        </button>
      </header>

      {error && <p className="error">{error}</p>}

      <AddForm today={today} onAdded={() => void load()} />

      {(overdue.length > 0 || dueToday.length > 0) && (
        <section className="urgent">
          <h2>지금 볼 것</h2>
          {overdue.map((t) => (
            <Row key={t.number} todo={t} today={today} onDone={() => void load()} />
          ))}
          {dueToday.map((t) => (
            <Row key={t.number} todo={t} today={today} onDone={() => void load()} />
          ))}
        </section>
      )}

      {SECTIONS.map((name) => {
        const rows = open.filter((t) => t.category === name);
        if (!rows.length) return null;
        return (
          <section key={name}>
            <h2>
              {name} <span className="count">{rows.length}</span>
            </h2>
            {rows.map((t) => (
              <Row key={t.number} todo={t} today={today} onDone={() => void load()} />
            ))}
          </section>
        );
      })}

      {hub && hub.projects.length > 0 && <HubSection hub={hub} />}

      <footer>
        <button className="ghost" onClick={() => { clearToken(); setAuthed(false); }}>
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
        <code>zoona/todo</code>의 Issues 읽기와 쓰기, Contents 읽기 권한을 준
        fine-grained 토큰을 붙여넣으세요. 이 브라우저에만 저장됩니다.
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

function AddForm({ today, onAdded }: { today: string; onAdded: () => void }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("개인");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await createTodo({ title: title.trim(), category, due: due || null });
      setTitle("");
      setDue("");
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
      <div className="add-row">
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
        </div>
        <input
          type="date"
          value={due}
          min={today}
          onChange={(e) => setDue(e.target.value)}
        />
      </div>
      <button className="primary" type="submit" disabled={busy || !title.trim()}>
        {busy ? "담는 중" : "담기"}
      </button>
    </form>
  );
}

function Row({
  todo,
  today,
  onDone,
}: {
  todo: Todo;
  today: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const state = dueState(todo.due, today);

  async function done() {
    setBusy(true);
    try {
      await closeTodo(todo.number);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={busy ? "row busy" : "row"}>
      <button className="check" onClick={done} aria-label="완료" disabled={busy} />
      <div className="body">
        <a href={todo.url} target="_blank" rel="noreferrer">
          {todo.title}
        </a>
        <div className="meta">
          {todo.inProgress && <span className="tag">진행중</span>}
          {state && <span className={`due ${state}`}>{dueLabel(todo.due!, state)}</span>}
        </div>
      </div>
    </div>
  );
}

function dueLabel(due: string, state: NonNullable<ReturnType<typeof dueState>>) {
  if (state === "overdue") return `${due} 지남`;
  if (state === "today") return "오늘";
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
