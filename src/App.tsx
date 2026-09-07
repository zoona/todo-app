import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AuthError,
  clearToken,
  closeTodo,
  createCategoryLabel,
  createTodo,
  deleteCategoryLabel,
  fetchClosedTodos,
  fetchHub,
  fetchTodosAndConfig,
  getToken,
  renameCategoryLabel,
  reopenTodo,
  saveConfig,
  setPriority,
  setProject,
  setToken,
} from "./api";
import {
  addCategory,
  DEFAULT_CONFIG,
  moveCategory,
  orderIndex,
  removeCategory,
  renameCategory,
  withOrder,
  type AppConfig,
  type BacklogSort,
} from "./config";
import { fromHub, fromTodos, splitByRecency, type DoneEntry } from "./done";
import { ageDays, isPulled, pullTitle, sortProjects, splitItem, staleLabel, staleOf } from "./hub";
import { compareTodos, dueState, todayInSeoul } from "./parse";
import { readOrigin, since } from "./devices";
import { UNSORTED, type HubFile, type Priority, type Todo } from "./types";
import {
  cleanCallbackUrl,
  consumeState,
  exchangeCode,
  loginReady,
  parseCallback,
  startLogin,
} from "./auth";
import { NotifyToggle } from "./NotifyToggle";
import "./App.css";

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [todos, setTodos] = useState<Todo[]>([]);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [hub, setHub] = useState<HubFile | null>(null);
  const [closed, setClosed] = useState<Todo[]>([]);
  // 체크한 항목은 목록에 남겨두고 줄만 긋는다. 눌러서 되돌릴 자리를 남기려는 것.
  const [checked, setChecked] = useState<Set<number>>(() => new Set());
  // 끌어오는 중인 백로그 항목 하나. 같은 것을 두 번 누르는 걸 막는다.
  const [pulling, setPulling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const today = todayInSeoul();
  // 화면 폭은 세션 중에 거의 안 바뀌므로 처음 한 번만 본다
  const [wide] = useState(() => window.matchMedia("(min-width: 980px)").matches);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ todos: list, config: cfg }, hubFile] = await Promise.all([
        fetchTodosAndConfig(),
        fetchHub(),
      ]);
      setTodos(list);
      setConfig(cfg);
      setHub(hubFile);
      // 새로 받아온 목록엔 닫힌 것이 없다. 남아 있던 체크 표시도 같이 비운다.
      setChecked(new Set());
      localStorage.setItem("todo.cache", JSON.stringify({ list, cfg, hubFile }));
    } catch (err) {
      if (err instanceof AuthError) {
        // 토큰을 지우지 않는다. 권한만 고치면 되는 경우가 많다.
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : String(err));
        const cached = localStorage.getItem("todo.cache");
        if (cached) {
          const { list, cfg, hubFile } = JSON.parse(cached);
          setTodos(list);
          if (cfg) setConfig(cfg);
          setHub(hubFile);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // GitHub 로그인 콜백이면 code를 토큰으로 바꾼다. 마운트 때 한 번.
  useEffect(() => {
    const cb = parseCallback(location.search);
    if (!cb) return;
    cleanCallbackUrl();
    if (!consumeState(cb.state)) {
      setError("로그인 확인값이 맞지 않습니다. 다시 로그인해 주세요.");
      return;
    }
    exchangeCode(cb.code)
      .then((token) => {
        setToken(token);
        setAuthed(true);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    if (authed) void load();
  }, [authed, load]);

  const sections = [...config.categories, UNSORTED];

  const sorted = useMemo(
    () => [...todos].sort((a, b) => compareTodos(a, b, today)),
    [todos, today],
  );

  /** 카테고리 안에서는 수동 순서가 우선, 순서에 없는 항목은 기본 정렬로 뒤에. */
  const rowsOf = useCallback(
    (name: string) =>
      sorted
        .filter((t) => t.category === name)
        .sort((a, b) => orderIndex(config, name, a.number) - orderIndex(config, name, b.number)),
    [sorted, config],
  );

  /** 완료 목록은 펼칠 때만 불러온다. 첫 화면에 필요 없는 호출이다. */
  const loadClosed = useCallback(async () => {
    try {
      setClosed(await fetchClosedTodos(config));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [config]);

  /**
   * 체크 토글. 화면을 먼저 바꾸고 GitHub 이슈를 닫거나 다시 연다.
   * 닫은 뒤 목록을 다시 받지 않는다 — 받으면 그 자리에서 사라져 되돌릴 수 없다.
   */
  const toggleDone = useCallback(async (todo: Todo, done: boolean) => {
    const mark = (on: boolean) =>
      setChecked((prev) => {
        const next = new Set(prev);
        if (on) next.add(todo.number);
        else next.delete(todo.number);
        return next;
      });

    mark(done);
    setError(null);
    try {
      if (done) await closeTodo(todo.number);
      else await reopenTodo(todo);
    } catch (err) {
      mark(!done); // GitHub에 안 닿았으면 화면도 되돌린다
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  /**
   * 백로그 항목을 실행 줄로 끌어온다.
   *
   * HUB 줄은 그대로 두고 이슈만 새로 세운다. 미러가 아니라 단기 실행 티켓이라
   * 주인은 계속 HUB다. 끝나면 이슈와 HUB 항목 양쪽을 닫아야 한다.
   */
  async function pullToRun(slug: string, title: string) {
    setPulling(`${slug}:${title}`);
    setError(null);
    try {
      await createTodo({
        title,
        category: config.categories[0] ?? null,
        priority: "보통",
        project: slug,
        due: null,
        origin: "백로그",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPulling(null);
    }
  }

  /** 드래그 결과 반영 — 화면 먼저 바꾸고 저장은 뒤에서. */
  async function reorder(category: string, numbers: number[]) {
    const next = withOrder(config, category, numbers);
    setConfig(next);
    await saveConfig(next);
  }

  /** 백로그 정렬 기준 변경. 화면에만 두지 않고 설정 이슈에 남긴다. */
  async function setBacklogSort(backlogSort: BacklogSort) {
    const next = { ...config, backlogSort };
    setConfig(next);
    await saveConfig(next);
  }

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
        </div>
      )}

      <div className="layout">
        <div className="col-todos">
          <AddForm today={today} hub={hub} categories={config.categories} onAdded={() => void load()} />

          {urgent.length > 0 && (
            <section className="urgent">
              <h2>지금 볼 것</h2>
              {urgent.map((t) => (
                <Row
                  key={t.number}
                  todo={t}
                  today={today}
                  hub={hub}
                  done={checked.has(t.number)}
                  onToggleDone={(on) => void toggleDone(t, on)}
                  onChanged={() => void load()}
                />
              ))}
            </section>
          )}

          {sections.map((name) => {
            const rows = rowsOf(name);
            if (!rows.length) return null;
            return (
              <Section
                key={name}
                name={name}
                rows={rows}
                today={today}
                hub={hub}
                checked={checked}
                onToggleDone={toggleDone}
                onChanged={() => void load()}
                onReorder={(numbers) => void reorder(name, numbers)}
              />
            );
          })}

          <CategoryManager config={config} onChanged={(cfg) => { setConfig(cfg); void load(); }} />

          <DoneSection
            entries={[...fromTodos(closed), ...fromHub(hub)]}
            onOpen={() => void loadClosed()}
            onReopened={() => {
              void load();
              void loadClosed();
            }}
          />
        </div>

        {hub && hub.projects.length > 0 && (
          <aside className="col-hub">
            <HubSection
              hub={hub}
              wide={wide}
              todos={todos}
              sort={config.backlogSort}
              onSort={(s) => void setBacklogSort(s)}
              pulling={pulling}
              onPull={(slug, title) => void pullToRun(slug, title)}
            />
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
          로그아웃
        </button>
      </footer>
    </div>
  );
}

/** 카테고리 한 섹션. 행을 끌어다 놓으면 순서가 저장된다(데스크톱). */
function Section({
  name,
  rows,
  today,
  hub,
  checked,
  onToggleDone,
  onChanged,
  onReorder,
}: {
  name: string;
  rows: Todo[];
  today: string;
  hub: HubFile | null;
  checked: Set<number>;
  onToggleDone: (todo: Todo, done: boolean) => void;
  onChanged: () => void;
  onReorder: (numbers: number[]) => void;
}) {
  const dragging = useRef<number | null>(null);

  function dropOn(target: number) {
    const from = dragging.current;
    dragging.current = null;
    if (from === null || from === target) return;
    // 끌던 것을 빼고, 놓은 자리(대상 항목 위치)에 끼운다
    const numbers = rows.map((t) => t.number).filter((n) => n !== from);
    numbers.splice(numbers.indexOf(target), 0, from);
    onReorder(numbers);
  }

  return (
    <section>
      <h2>
        {name} <span className="count">{rows.length}</span>
      </h2>
      {rows.map((t) => (
        <div
          key={t.number}
          draggable
          onDragStart={() => (dragging.current = t.number)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => dropOn(t.number)}
        >
          <Row
            todo={t}
            today={today}
            hub={hub}
            done={checked.has(t.number)}
            onToggleDone={(on) => onToggleDone(t, on)}
            onChanged={onChanged}
          />
        </div>
      ))}
    </section>
  );
}

function TokenGate({ onSaved, error }: { onSaved: () => void; error: string | null }) {
  const [value, setValue] = useState("");
  const manual = (
    <>
      <p>
        <code>zoona/todo</code> 하나만 고른 fine-grained 토큰을 붙여넣으세요. 권한은
        Issues 읽기와 쓰기, Contents 읽기. 이 브라우저에만 저장됩니다.
      </p>
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
    </>
  );

  return (
    <div className="app gate">
      <h1>할 일</h1>
      {error && <p className="error">{error}</p>}
      {loginReady() ? (
        <>
          <button className="primary" onClick={startLogin}>
            GitHub로 로그인
          </button>
          <p className="hint">할 일이 담긴 zoona/todo에 접근을 승인하는 것뿐입니다.</p>
          <details className="manual-token">
            <summary>토큰으로 직접 넣기</summary>
            {manual}
          </details>
        </>
      ) : (
        manual
      )}
    </div>
  );
}

function AddForm({
  today,
  hub,
  categories,
  onAdded,
}: {
  today: string;
  hub: HubFile | null;
  categories: string[];
  onAdded: () => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [priority, setPriorityValue] = useState<Priority>("보통");
  const [project, setProjectValue] = useState("");
  const [due, setDue] = useState("");
  const [withTime, setWithTime] = useState(false);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const open = title.trim().length > 0;
  const chosen = category ?? categories[0] ?? null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await createTodo({
        title: title.trim(),
        category: chosen,
        priority,
        project: project || null,
        due: due ? due.replace("T", " ") : null,
      });
      setTitle("");
      setDue("");
      setProjectValue("");
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
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className={chosen === c ? "chip on" : "chip"}
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

          <select value={project} onChange={(e) => setProjectValue(e.target.value)}>
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
  hub,
  done,
  onToggleDone,
  onChanged,
}: {
  todo: Todo;
  today: string;
  hub: HubFile | null;
  done: boolean;
  onToggleDone: (done: boolean) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [linking, setLinking] = useState(false);
  const state = dueState(todo.due, today);
  const origin = readOrigin(todo.origin);
  const projectTitle = hub?.projects.find((p) => p.slug === todo.project)?.title;

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

  // 끝낸 것은 체크만 살리고 나머지는 잠근다. 잘못 누른 김에 다른 것까지 바뀌면 곤란하다.
  const locked = busy || done;

  return (
    <div className={`row${busy ? " busy" : ""}${done ? " checked" : ""}${todo.project ? " linked" : ""}`}>
      <input
        type="checkbox"
        className="check"
        checked={done}
        onChange={(e) => onToggleDone(e.target.checked)}
        aria-label={done ? "되돌리기" : "완료"}
        disabled={busy}
      />
      <div className="body">
        <a href={todo.url} target="_blank" rel="noreferrer">
          {todo.title}
        </a>
        <div className="meta">
          {/* 글자로 적는다. 점 하나로 뒀더니 무슨 뜻인지도, 누를 수 있는지도 안 보였다. */}
          <button
            className={`prio p${todo.priority}`}
            disabled={locked}
            onClick={() => void run(() => setPriority(todo, nextPriority))}
            aria-label={`우선순위 ${todo.priority}, 눌러서 바꾸기`}
          >
            {todo.priority}
          </button>

          {/* 프로젝트 연결 — 누르면 바꾸거나 해제. 할 일 일부만 프로젝트에 붙는다. */}
          {linking ? (
            <select
              autoFocus
              value={todo.project ?? ""}
              onChange={(e) => {
                setLinking(false);
                void run(() => setProject(todo, e.target.value || null));
              }}
              onBlur={() => setLinking(false)}
            >
              <option value="">연결 없음</option>
              {hub?.projects.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.title}
                </option>
              ))}
            </select>
          ) : todo.project ? (
            <button className="tag project" disabled={locked} onClick={() => setLinking(true)}>
              {projectTitle ?? todo.project}
            </button>
          ) : (
            <button className="tag link-add" disabled={locked} onClick={() => setLinking(true)}>
              + 프로젝트
            </button>
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

/** 카테고리 추가, 이름 바꾸기, 삭제, 순서. 실체는 repo 라벨이고 목록·순서는 설정 이슈. */
function CategoryManager({
  config,
  onChanged,
}: {
  config: AppConfig;
  onChanged: (cfg: AppConfig) => void;
}) {
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<AppConfig>) {
    setBusy(true);
    try {
      const next = await fn();
      await saveConfig(next);
      onChanged(next);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="cat-manage">
      <summary>카테고리 관리</summary>
      <ul>
        {config.categories.map((c) => (
          <li key={c}>
            <span>{c}</span>
            <span className="cat-buttons">
              <button className="ghost" disabled={busy} onClick={() => void run(async () => moveCategory(config, c, -1))}>↑</button>
              <button className="ghost" disabled={busy} onClick={() => void run(async () => moveCategory(config, c, 1))}>↓</button>
              <button
                className="ghost"
                disabled={busy}
                onClick={() => {
                  const to = prompt(`"${c}"의 새 이름`, c)?.trim();
                  if (!to || to === c) return;
                  void run(async () => {
                    await renameCategoryLabel(c, to);
                    return renameCategory(config, c, to);
                  });
                }}
              >
                이름
              </button>
              <button
                className="ghost danger"
                disabled={busy}
                onClick={() => {
                  if (!confirm(`"${c}"를 지웁니다. 붙어 있던 할 일은 미분류가 됩니다.`)) return;
                  void run(async () => {
                    await deleteCategoryLabel(c);
                    return removeCategory(config, c);
                  });
                }}
              >
                삭제
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div className="cat-add">
        <input
          value={adding}
          placeholder="새 카테고리"
          onChange={(e) => setAdding(e.target.value)}
        />
        <button
          className="ghost"
          disabled={busy || !adding.trim()}
          onClick={() => {
            const name = adding.trim();
            setAdding("");
            void run(async () => {
              await createCategoryLabel(name);
              return addCategory(config, name);
            });
          }}
        >
          추가
        </button>
      </div>
    </details>
  );
}

function tidy(text: string): string {
  return text.replace(/\*\*/g, "").replace(/`/g, "").replace(/·/g, ", ");
}

function hubUrl(slug: string) {
  return `https://github.com/zoona/working/blob/main/projects/${slug}/HUB.md`;
}

function HubSection({
  hub,
  wide,
  todos,
  sort,
  onSort,
  pulling,
  onPull,
}: {
  hub: HubFile;
  wide: boolean;
  todos: Todo[];
  sort: BacklogSort;
  onSort: (s: BacklogSort) => void;
  pulling: string | null;
  onPull: (slug: string, title: string) => void;
}) {
  const now = Date.now();
  // 실행 줄로 끌어온 것이 있는 프로젝트 — 백로그와 실행의 연결이 여기서 보인다
  const pulled = (slug: string) => todos.filter((t) => t.project === slug).length;

  return (
    <section className="hub">
      <h2>
        <span className="title">프로젝트 백로그</span>
        <select
          className="sort"
          value={sort}
          onChange={(e) => onSort(e.target.value as BacklogSort)}
          aria-label="백로그 정렬"
        >
          <option value="stale">Stale first</option>
          <option value="name">A–Z</option>
        </select>
      </h2>
      {sortProjects(hub.projects, sort, now).map((p) => {
        const stale = staleOf(p, now);
        const active = pulled(p.slug);
        return (
          <details key={p.slug} open={wide}>
            <summary>
              {tidy(p.title)} <span className="count">{p.items.length}</span>
              {active > 0 && <span className="pulled">실행 {active}</span>}
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
                const days = ageDays(item.date, now);
                const { head, rest } = splitItem(tidy(item.text));
                // 제목은 화면에 보이는 앞머리가 아니라 끌어오기용으로 따로 뽑는다
                const title = pullTitle(tidy(item.text));
                return (
                  // 모바일에서는 두 줄로 접고 누르면 펼친다. 항목이 문단 길이인 게 많다.
                  <li
                    key={i}
                    className="hub-item"
                    style={{ marginLeft: item.depth * 12 }}
                    onClick={(e) => e.currentTarget.classList.toggle("expanded")}
                  >
                    <div className="hub-body">
                      <div className="hub-head">{head}</div>
                      {rest && <div className="hub-rest">{rest}</div>}
                    </div>
                    {/* 실행 줄로 올릴 자리. 이미 올라간 것은 버튼 대신 표시만 남긴다. */}
                    {isPulled(title, p.slug, todos) ? (
                      <span className="pulled">실행 중</span>
                    ) : (
                      <button
                        className="pull"
                        disabled={pulling !== null}
                        onClick={(e) => {
                          e.stopPropagation(); // 누르면 항목이 펼쳐지는 걸 막는다
                          onPull(p.slug, title);
                        }}
                      >
                        {pulling === `${p.slug}:${title}` ? "올리는 중" : "끌어오기"}
                      </button>
                    )}
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

/**
 * 끝낸 것. 접혀 있고 펼칠 때만 닫힌 이슈를 불러온다.
 * 최근 7일과 그 이전으로 가르는데, 오래된 쪽은 한 번 더 접어 둔다.
 */
function DoneSection({
  entries,
  onOpen,
  onReopened,
}: {
  entries: DoneEntry[];
  onOpen: () => void;
  onReopened: () => void;
}) {
  const [showOlder, setShowOlder] = useState(false);
  const { recent, older } = splitByRecency(entries, Date.now());

  return (
    <details className="done" onToggle={(e) => e.currentTarget.open && onOpen()}>
      <summary>
        끝낸 것 <span className="count">{entries.length}</span>
      </summary>

      <h3>최근 7일</h3>
      {recent.length === 0 ? (
        <p className="empty">없음</p>
      ) : (
        recent.map((e) => <DoneRow key={e.key} entry={e} onReopened={onReopened} />)
      )}

      {older.length > 0 && (
        <>
          <button className="ghost more" onClick={() => setShowOlder((v) => !v)}>
            {showOlder ? "그 이전 접기" : `그 이전 ${older.length}건 보기`}
          </button>
          {showOlder &&
            older.map((e) => <DoneRow key={e.key} entry={e} onReopened={onReopened} />)}
        </>
      )}
    </details>
  );
}

function DoneRow({ entry, onReopened }: { entry: DoneEntry; onReopened: () => void }) {
  const [busy, setBusy] = useState(false);
  // 한 번 눌러 묻고 다시 눌러야 실행한다. 목록을 훑다가 스쳐도 열리지 않게.
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!asking) return;
    const t = setTimeout(() => setAsking(false), 5000);
    return () => clearTimeout(t);
  }, [asking]);

  async function reopen() {
    if (!entry.todo) return;
    setAsking(false);
    setBusy(true);
    try {
      await reopenTodo(entry.todo);
      onReopened();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="done-row">
      <div className="done-title">{tidy(entry.title)}</div>
      {/* 세 층을 겉모습으로 가른다. 라벨은 아무 표시 없음, 링크는 밑줄,
          버튼은 테두리. 링크는 한 줄에 하나만 두고 글자가 도착지를 말한다. */}
      <div className="meta">
        {entry.at && <span className="done-when">{since(entry.at)}</span>}

        {entry.project && (
          <a className="go" href={hubUrl(entry.project.slug)} target="_blank" rel="noreferrer">
            {tidy(entry.project.title)} 백로그 ↗
          </a>
        )}
        {entry.todo && (
          <a className="go" href={entry.todo.url} target="_blank" rel="noreferrer">
            이슈 #{entry.todo.number}
            {entry.todo.comments > 0 ? ` (댓글 ${entry.todo.comments})` : ""} ↗
          </a>
        )}

        {entry.todo &&
          (asking ? (
            <>
              <button className="act danger" disabled={busy} onClick={() => void reopen()}>
                {busy ? "여는 중" : "다시 열기"}
              </button>
              <button className="act" disabled={busy} onClick={() => setAsking(false)}>
                취소
              </button>
            </>
          ) : (
            <button className="act" disabled={busy} onClick={() => setAsking(true)}>
              되돌리기
            </button>
          ))}
      </div>
    </div>
  );
}
