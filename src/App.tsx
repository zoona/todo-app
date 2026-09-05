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
import { readOrigin, since } from "./devices";
import {
  CATEGORIES,
  UNSORTED,
  type HubFile,
  type Priority,
  type Todo,
} from "./types";
import { NotifyToggle } from "./NotifyToggle";
import "./App.css";

const SECTIONS = [...CATEGORIES, UNSORTED];

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [todos, setTodos] = useState<Todo[]>([]);
  const [hub, setHub] = useState<HubFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const today = todayInSeoul();
  // 화면 폭은 세션 중에 거의 안 바뀌므로 처음 한 번만 본다
  const [wide] = useState(() => window.matchMedia("(min-width: 980px)").matches);

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
        // 토큰을 지우지 않는다. 권한만 고치면 되는 경우가 많은데,
        // 지워버리면 GitHub가 값을 한 번만 보여주므로 재발급까지 가게 된다.
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

      {error && (
        <div className="error-box">
          <p className="error">{error}</p>
          <p className="hint">
            권한을 고쳤다면 새로고침만 하면 됩니다. 토큰 값은 그대로입니다.
          </p>
        </div>
      )}

      <div className="layout">
        <div className="col-todos">
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
        </div>

        {hub && hub.projects.length > 0 && (
          <aside className="col-hub">
            <HubSection hub={hub} wide={wide} />
          </aside>
        )}
      </div>

      <footer>
        <NotifyToggle />
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
  const open = title.trim().length > 0;

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
        placeholder="새 할 일"
        onChange={(e) => setTitle(e.target.value)}
        enterKeyHint="done"
      />

      {/* 아무것도 안 친 상태에서는 입력 한 줄만 둔다. 목록이 주인공이다. */}
      {open && (
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
      )}

      {open && more && (
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

      {open && (
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "담는 중" : "담기"}
        </button>
      )}
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
  const origin = readOrigin(todo.origin);

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
          {/* 대부분이 보통이라 보통은 점 하나로 둔다. 다 적으면 눈에 걸린다. */}
          <button
            className={`prio p${todo.priority}`}
            disabled={busy}
            onClick={() => void run(() => setPriority(todo, nextPriority))}
            aria-label={`우선순위 ${todo.priority}, 눌러서 바꾸기`}
          >
            {todo.priority === "보통" ? "·" : todo.priority}
          </button>
          {todo.project && (
            <a
              className="tag"
              href={hubUrl(todo.project)}
              target="_blank"
              rel="noreferrer"
            >
              {todo.project}
            </a>
          )}
          {todo.inProgress && <span className="tag">진행중</span>}
          {state && <span className={`due ${state}`}>{dueLabel(todo.due!, state)}</span>}
          {origin &&
            (origin.session ? (
              <a className="tag origin" href={origin.session} target="_blank" rel="noreferrer">
                {origin.label} ↗
              </a>
            ) : (
              <span className="tag origin">{origin.label}</span>
            ))}
          {todo.createdAt && <span className="tag when">{since(todo.createdAt)}</span>}
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

const DAY = 86400000;

/** HUB 원문은 마크다운이라 강조 기호가 평문 렌더에서 날것으로 보인다. 벗겨낸다. */
function tidy(text: string): string {
  return text.replace(/\*\*/g, "").replace(/`/g, "").replace(/·/g, ", ");
}

function hubUrl(slug: string) {
  return `https://github.com/zoona/working/blob/main/projects/${slug}/HUB.md`;
}

function ageDays(date: string | null | undefined): number {
  return date ? Math.floor((Date.now() - Date.parse(date)) / DAY) : 0;
}

function staleLabel(days: number): string {
  if (days >= 365) return `${Math.floor(days / 365)}년 방치`;
  if (days >= 30) return `${Math.floor(days / 30)}개월 방치`;
  return `${Math.floor(days / 7)}주 방치`;
}

function HubSection({ hub, wide }: { hub: HubFile; wide: boolean }) {
  // 정리 판단용 신호: 프로젝트마다 가장 오래 방치된 항목 기준으로 요약에도 띄운다
  const staleOf = (p: HubFile["projects"][number]) =>
    Math.max(0, ...p.items.map((i) => ageDays(i.date)));

  return (
    <section className="hub">
      <h2>프로젝트 남은 일</h2>
      {hub.projects.map((p) => {
        const stale = staleOf(p);
        return (
        <details key={p.slug} open={wide}>
          <summary>
            {tidy(p.title)} <span className="count">{p.items.length}</span>
            {stale >= 21 && <span className="age stale">{staleLabel(stale)}</span>}
            <a
              className="hub-open"
              href={hubUrl(p.slug)}
              target="_blank"
              rel="noreferrer"
              aria-label="HUB 문서 열기"
              onClick={(e) => e.stopPropagation()}
            >
              ↗
            </a>
          </summary>
          <ul>
            {p.items.map((item, i) => {
              const days = ageDays(item.date);
              return (
                // 모바일에서는 두 줄로 접고 누르면 펼친다. 항목이 문단 길이인 게 많다.
                // (재렌더 시 접힘으로 돌아가는 건 감수 — 상태 배열보다 싸다)
                <li
                  key={i}
                  className="hub-item"
                  style={{ marginLeft: item.depth * 12 }}
                  onClick={(e) => e.currentTarget.classList.toggle("expanded")}
                >
                  {tidy(item.text)}
                  {days >= 7 && (
                    <span className={days >= 21 ? "age stale" : "age"}>{since(item.date!)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
        );
      })}
      <p className="stamp">
        {hub.drawnAt} 기준 · 커밋 {hub.commit} ({hub.commitDate})
      </p>
    </section>
  );
}
