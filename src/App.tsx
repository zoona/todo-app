import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AuthError,
  clearToken,
  closeTodo,
  dropTodo,
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
  setCategoryLabel,
  setDue,
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
import {
  BANDS,
  bandOf,
  CONTINUE,
  daysSince,
  isStale,
  isToday,
  periodLabel,
  shortTitle,
  splitRecurring,
  summaryOf,
  type RecurringGroup,
} from "./groups";
import { UNSORTED, type HubFile, type Priority, type Todo } from "./types";
import {
  cleanCallbackUrl,
  consumeState,
  exchangeCode,
  loginReady,
  parseCallback,
  handOverToken,
  inFrame,
  isPopupLogin,
  startLogin,
  startLoginPopup,
} from "./auth";
import { NotifyToggle } from "./NotifyToggle";
import "./App.css";

/**
 * 화면은 쓰임새로 나눈다.
 *
 * 오늘: 아침에 열어 지금 손댈 것만 본다. 마감, 높음, 진행중, 정기 할 일.
 * 이어가기: 여러 세션에 걸친 개인 작업. 누르면 Cursor에서 그 세션이 열린다.
 * 전체: 카테고리를 가로 칩으로 골라 본다. 세로로 쌓으면 업무 아래가 안 보였다.
 * 정리: 한 달 넘게 손 안 댄 것을 하나씩 끝내거나 지운다. 회의에서 담은 것이 쌓이는 자리.
 * 백로그: 프로젝트 HUB의 남은 일. 끝낸 것: 되짚기와 되돌리기.
 */
type Tab = "today" | "continue" | "all" | "triage" | "backlog" | "done";
const TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "오늘" },
  { id: "continue", label: "이어가기" },
  { id: "all", label: "전체" },
  { id: "triage", label: "정리" },
  { id: "backlog", label: "백로그" },
  { id: "done", label: "끝낸 것" },
];

const TAB_KEY = "todo.tab";
const CAT_KEY = "todo.cat";
const KEPT_KEY = "todo.kept";

/** 카테고리 색. 설정 순서로 정해져서 카테고리를 옮기지 않는 한 바뀌지 않는다 */
const PALETTE = ["#4a86e8", "#3fb27f", "#a371f7", "#d9a441", "#e5734b", "#2bb5c4", "#d65a9a"];

function readKept(): Record<number, string> {
  try {
    return JSON.parse(localStorage.getItem(KEPT_KEY) ?? "{}");
  } catch {
    return {};
  }
}

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
  const [tab, setTabState] = useState<Tab>(() => {
    const saved = localStorage.getItem(TAB_KEY) as Tab | null;
    return saved && TABS.some((t) => t.id === saved) ? saved : "today";
  });
  const [cat, setCatState] = useState<string>(() => localStorage.getItem(CAT_KEY) ?? "");
  // 정리에서 "그대로 둠"을 누른 것. 이 기기에만 두고 한 달 뒤 다시 후보가 된다.
  const [kept, setKept] = useState<Record<number, string>>(readKept);
  const [settings, setSettings] = useState(false);
  const today = todayInSeoul();
  const now = Date.now();
  // 화면 폭은 세션 중에 거의 안 바뀌므로 처음 한 번만 본다
  const [wide] = useState(() => window.matchMedia("(min-width: 980px)").matches);

  const setTab = (t: Tab) => {
    setTabState(t);
    localStorage.setItem(TAB_KEY, t);
    window.scrollTo({ top: 0 });
  };
  const setCat = (c: string) => {
    setCatState(c);
    localStorage.setItem(CAT_KEY, c);
  };

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
  // 위키 홈 같은 화면 안에서 연 새 창 로그인이면 바로 GitHub로 보낸다.
  useEffect(() => {
    const cb = parseCallback(location.search);
    if (!cb) {
      if (isPopupLogin(location.search)) startLogin();
      return;
    }
    cleanCallbackUrl();
    if (!consumeState(cb.state)) {
      setError("로그인 확인값이 맞지 않습니다. 다시 로그인해 주세요.");
      return;
    }
    exchangeCode(cb.code)
      .then((token) => {
        setToken(token);
        if (handOverToken(token)) return;
        setAuthed(true);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    if (authed) void load();
  }, [authed, load]);

  const sorted = useMemo(
    () => [...todos].sort((a, b) => compareTodos(a, b, today)),
    [todos, today],
  );

  const colorOf = useCallback(
    (name: string) => {
      const i = config.categories.indexOf(name);
      return i < 0 ? "#8b93a3" : PALETTE[i % PALETTE.length];
    },
    [config.categories],
  );

  /** 완료 목록은 그 탭을 열 때만 불러온다. 첫 화면에 필요 없는 호출이다. */
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

  function keep(todo: Todo) {
    const next = { ...kept, [todo.number]: new Date().toISOString() };
    setKept(next);
    localStorage.setItem(KEPT_KEY, JSON.stringify(next));
  }

  if (!authed) {
    return <TokenGate onSaved={() => setAuthed(true)} error={error} />;
  }

  const { singles, groups } = splitRecurring(sorted);
  const continuing = singles.filter((t) => t.category === CONTINUE);
  const regular = singles.filter((t) => t.category !== CONTINUE);
  const todayList = regular.filter((t) => isToday(t, today));
  // 이번 주에 담은 것. 회의와 세션에서 막 담은 일이 마감 없이 들어와 오늘 목록에 안 걸린다.
  const recent = regular.filter((t) => !isToday(t, today) && daysSince(t.createdAt, now) < 7);
  const stale = regular
    .filter((t) => isStale(t, now))
    .filter((t) => !kept[t.number] || daysSince(kept[t.number], now) >= 30)
    .sort((a, b) => (a.updatedAt || a.createdAt).localeCompare(b.updatedAt || b.createdAt));
  const pastRecurring = groups.reduce((n, g) => n + g.items.length - 1, 0);
  const doneEntries = [...fromTodos(closed), ...fromHub(hub)];

  const counts: Record<Tab, number | null> = {
    today: todayList.length + recent.length + groups.length,
    continue: continuing.length,
    all: todos.length,
    triage: stale.length + pastRecurring,
    backlog: hub ? hub.projects.reduce((n, p) => n + p.items.length, 0) : null,
    done: null,
  };

  const rowProps = {
    today,
    hub,
    categories: config.categories,
    colorOf,
    onChanged: () => void load(),
  };
  const isDone = (t: Todo) => checked.has(t.number);

  return (
    <div className={`app${wide ? " wide" : ""}`}>
      <header className="top">
        <h1>할 일</h1>
        <AddForm
          today={today}
          hub={hub}
          categories={config.categories}
          initial={tab === "continue" ? CONTINUE : tab === "all" && cat ? cat : null}
          onAdded={() => void load()}
        />
        <div className="top-actions">
          <button className="ghost" onClick={() => void load()} disabled={loading} aria-label="새로고침">
            {loading ? "…" : "↻"}
          </button>
          <button
            className={settings ? "ghost on" : "ghost"}
            onClick={() => setSettings((v) => !v)}
            aria-label="설정"
            aria-expanded={settings}
          >
            ⚙
          </button>
        </div>
      </header>

      {settings && (
        <div className="settings">
          <CategoryManager config={config} onChanged={(cfg) => { setConfig(cfg); void load(); }} />
          <div className="settings-row">
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
          </div>
        </div>
      )}

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab${tab === t.id ? " on" : ""}${t.id === "triage" && counts.triage ? " warn" : ""}`}
            onClick={() => {
              setTab(t.id);
              if (t.id === "done") void loadClosed();
            }}
          >
            {t.label}
            {counts[t.id] ? <span className="n">{counts[t.id]}</span> : null}
          </button>
        ))}
      </nav>

      {error && (
        <div className="error-box">
          <p className="error">{error}</p>
        </div>
      )}

      {tab === "today" && (
        <div className="today-grid">
          <div>
            <Block title="마감과 높음" count={todayList.length} empty="오늘 볼 할 일 없음">
              {todayList.map((t) => (
                <Row key={t.number} todo={t} {...rowProps} showCategory done={isDone(t)} onToggleDone={(on) => void toggleDone(t, on)} />
              ))}
            </Block>
            {recent.length > 0 && (
              <Block title="이번 주에 담은 것" count={recent.length}>
                {recent.map((t) => (
                  <Row key={t.number} todo={t} {...rowProps} showCategory done={isDone(t)} onToggleDone={(on) => void toggleDone(t, on)} />
                ))}
              </Block>
            )}
            {stale.length + pastRecurring > 0 && (
              <button className="nudge" onClick={() => setTab("triage")}>
                정리할 것 {stale.length + pastRecurring}건 <span>→</span>
              </button>
            )}
          </div>
          <div>
            {continuing.length > 0 && (
              <Block title="이어가기" count={continuing.length}>
                <div className="cont-list">
                  {continuing.map((t) => (
                    <ContinueCard key={t.number} todo={t} hub={hub} compact done={isDone(t)} onToggleDone={(on) => void toggleDone(t, on)} />
                  ))}
                </div>
              </Block>
            )}
            {groups.length > 0 && (
              <Block title="정기" count={groups.length}>
                {groups.map((g) => (
                  <RecurringRow key={g.base} group={g} checked={checked} onToggleDone={(t, on) => void toggleDone(t, on)} />
                ))}
              </Block>
            )}
          </div>
        </div>
      )}

      {tab === "continue" && (
        <Block title="여러 세션에 걸쳐 이어 가는 작업" count={continuing.length} empty="이어 가는 작업 없음">
          <div className="cont-grid">
            {continuing.map((t) => (
              <ContinueCard key={t.number} todo={t} hub={hub} done={isDone(t)} onToggleDone={(on) => void toggleDone(t, on)} />
            ))}
          </div>
        </Block>
      )}

      {tab === "all" && (
        <AllView
          todos={singles}
          groups={groups}
          config={config}
          cat={cat}
          setCat={setCat}
          now={now}
          colorOf={colorOf}
          checked={checked}
          rowProps={rowProps}
          onToggleDone={(t, on) => void toggleDone(t, on)}
          onReorder={(c, numbers) => void reorder(c, numbers)}
        />
      )}

      {tab === "triage" && (
        <TriageView
          stale={stale}
          groups={groups.filter((g) => g.items.length > 1)}
          now={now}
          hub={hub}
          colorOf={colorOf}
          checked={checked}
          onToggleDone={(t, on) => void toggleDone(t, on)}
          onKeep={keep}
          onChanged={() => void load()}
        />
      )}

      {tab === "backlog" &&
        (hub && hub.projects.length > 0 ? (
          <HubSection
            hub={hub}
            todos={todos}
            sort={config.backlogSort}
            onSort={(s) => void setBacklogSort(s)}
            pulling={pulling}
            onPull={(slug, title) => void pullToRun(slug, title)}
          />
        ) : (
          <p className="empty">백로그 없음</p>
        ))}

      {tab === "done" && (
        <DoneView
          entries={doneEntries}
          onReopened={() => {
            void load();
            void loadClosed();
          }}
        />
      )}
    </div>
  );
}

function Block({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count?: number;
  empty?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="block">
      <h2>
        {title} {count ? <span className="count">{count}</span> : null}
      </h2>
      {count === 0 && empty ? <p className="empty">{empty}</p> : children}
    </section>
  );
}

type RowShared = {
  today: string;
  hub: HubFile | null;
  categories: string[];
  colorOf: (name: string) => string;
  onChanged: () => void;
};

/** 전체 탭. 카테고리는 가로 칩으로 고르고, 목록은 담은 시점으로 묶는다. */
function AllView({
  todos,
  groups,
  config,
  cat,
  setCat,
  now,
  colorOf,
  checked,
  rowProps,
  onToggleDone,
  onReorder,
}: {
  todos: Todo[];
  groups: RecurringGroup[];
  config: AppConfig;
  cat: string;
  setCat: (c: string) => void;
  now: number;
  colorOf: (name: string) => string;
  checked: Set<number>;
  rowProps: RowShared;
  onToggleDone: (t: Todo, on: boolean) => void;
  onReorder: (category: string, numbers: number[]) => void;
}) {
  const [showOld, setShowOld] = useState(false);
  const names = [...config.categories, UNSORTED];
  const countOf = (name: string) =>
    todos.filter((t) => t.category === name).length +
    groups.filter((g) => g.items[0].category === name).reduce((n, g) => n + g.items.length, 0);
  // 지워진 카테고리를 고른 채로 남아 있으면 전체로 돌린다
  const current = names.includes(cat) ? cat : "";
  const rows = todos
    .filter((t) => !current || t.category === current)
    .sort((a, b) =>
      current ? orderIndex(config, current, a.number) - orderIndex(config, current, b.number) : 0,
    );
  const recurring = groups.filter((g) => !current || g.items[0].category === current);
  const dragging = useRef<number | null>(null);

  function dropOn(target: number) {
    const from = dragging.current;
    dragging.current = null;
    if (!current || from === null || from === target) return;
    const numbers = rows.map((t) => t.number).filter((n) => n !== from);
    numbers.splice(numbers.indexOf(target), 0, from);
    onReorder(current, numbers);
  }

  return (
    <>
      <div className="cat-chips">
        <button className={current ? "cat-chip" : "cat-chip on"} onClick={() => setCat("")}>
          전체 <span className="n">{todos.length + groups.reduce((n, g) => n + g.items.length, 0)}</span>
        </button>
        {names.map((name) => {
          const n = countOf(name);
          if (!n && name !== current) return null;
          return (
            <button
              key={name}
              className={current === name ? "cat-chip on" : "cat-chip"}
              style={{ "--cat": colorOf(name) } as React.CSSProperties}
              onClick={() => setCat(name)}
            >
              <i className="dot" />
              {name} <span className="n">{n}</span>
            </button>
          );
        })}
      </div>

      {recurring.length > 0 && (
        <Block title="정기" count={recurring.length}>
          {recurring.map((g) => (
            <RecurringRow key={g.base} group={g} checked={checked} onToggleDone={onToggleDone} />
          ))}
        </Block>
      )}

      {BANDS.map((band) => {
        const list = rows.filter((t) => bandOf(t, now) === band);
        if (!list.length) return null;
        const folded = band === "그 이전" && !showOld;
        return (
          <section className="block" key={band}>
            <h2>
              {band} <span className="count">{list.length}</span>
            </h2>
            {folded ? (
              <button className="ghost more" onClick={() => setShowOld(true)}>
                {list.length}건 펼치기
              </button>
            ) : (
              list.map((t) => (
                <div
                  key={t.number}
                  draggable={!!current}
                  onDragStart={() => (dragging.current = t.number)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => dropOn(t.number)}
                >
                  <Row
                    todo={t}
                    {...rowProps}
                    showCategory={!current}
                    done={checked.has(t.number)}
                    onToggleDone={(on) => onToggleDone(t, on)}
                  />
                </div>
              ))
            )}
          </section>
        );
      })}
      {rows.length === 0 && recurring.length === 0 && <p className="empty">할 일 없음</p>}
    </>
  );
}

/**
 * 정리 탭. 회의와 세션에서 담고 잊힌 것을 주에 한 번 훑어 끝내거나 지운다.
 * 아직 할 것이면 "그대로 둠"으로 한 달 동안 후보에서 뺀다.
 */
function TriageView({
  stale,
  groups,
  now,
  hub,
  colorOf,
  checked,
  onToggleDone,
  onKeep,
  onChanged,
}: {
  stale: Todo[];
  groups: RecurringGroup[];
  now: number;
  hub: HubFile | null;
  colorOf: (name: string) => string;
  checked: Set<number>;
  onToggleDone: (t: Todo, on: boolean) => void;
  onKeep: (t: Todo) => void;
  onChanged: () => void;
}) {
  return (
    <>
      {groups.length > 0 && (
        <Block title="지난 기간이 남은 정기 할 일" count={groups.length}>
          {groups.map((g) => (
            <RecurringRow key={g.base} group={g} checked={checked} onToggleDone={onToggleDone} />
          ))}
        </Block>
      )}
      <Block title="한 달 넘게 손대지 않은 할 일" count={stale.length} empty="정리할 것 없음">
        {stale.map((t) => (
          <TriageRow
            key={t.number}
            todo={t}
            days={daysSince(t.updatedAt || t.createdAt, now)}
            hub={hub}
            color={colorOf(t.category)}
            done={checked.has(t.number)}
            onDone={() => onToggleDone(t, !checked.has(t.number))}
            onKeep={() => onKeep(t)}
            onChanged={onChanged}
          />
        ))}
      </Block>
    </>
  );
}

function TriageRow({
  todo,
  days,
  hub,
  color,
  done,
  onDone,
  onKeep,
  onChanged,
}: {
  todo: Todo;
  days: number;
  hub: HubFile | null;
  color: string;
  done: boolean;
  onDone: () => void;
  onKeep: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [dropped, setDropped] = useState(false);
  const summary = summaryOf(todo.body);
  const projectTitle = hub?.projects.find((p) => p.slug === todo.project)?.title;

  async function drop() {
    setBusy(true);
    try {
      await dropTodo(todo.number);
      setDropped(true);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`triage-row${done || dropped ? " checked" : ""}`}>
      <div className="body">
        <a href={todo.url} target="_blank" rel="noreferrer" className="title">
          {todo.title}
        </a>
        {summary && <p className="summary">{summary}</p>}
        <div className="meta">
          <span className="cat" style={{ "--cat": color } as React.CSSProperties}>
            <i className="dot" />
            {todo.category}
          </span>
          {projectTitle && <span className="tag project">{shortTitle(projectTitle)}</span>}
          <span className="age stale">{Math.floor(days / 30) || 1}개월 손 안 댐</span>
        </div>
      </div>
      <div className="triage-acts">
        {dropped ? (
          <span className="dim">지움</span>
        ) : (
          <>
            <button className={done ? "act on" : "act"} disabled={busy} onClick={onDone}>
              {done ? "되돌리기" : "끝냄"}
            </button>
            {!done && (
              <>
                <button className="act" disabled={busy} onClick={onKeep}>
                  그대로 둠
                </button>
                <button className="act danger" disabled={busy} onClick={() => void drop()}>
                  지움
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** 정기 할 일 한 줄. 같은 제목의 기간별 이슈를 칩으로 모은다. */
function RecurringRow({
  group,
  checked,
  onToggleDone,
}: {
  group: RecurringGroup;
  checked: Set<number>;
  onToggleDone: (t: Todo, on: boolean) => void;
}) {
  const open = group.items.filter((t) => !checked.has(t.number));
  const past = open.slice(0, -1);
  return (
    <div className="row recurring">
      <div className="body">
        <span className="title">{group.base}</span>
        <div className="periods">
          {group.items.map((t, i) => {
            const on = checked.has(t.number);
            return (
              <button
                key={t.number}
                className={`period${on ? " on" : ""}${i === group.items.length - 1 ? " latest" : ""}`}
                onClick={() => onToggleDone(t, !on)}
                aria-label={`${periodLabel(t.title)} ${on ? "되돌리기" : "끝냄"}`}
              >
                {on ? "✓ " : ""}
                {periodLabel(t.title)}
              </button>
            );
          })}
        </div>
      </div>
      {past.length > 0 && (
        <button className="act" onClick={() => past.forEach((t) => onToggleDone(t, true))}>
          지난 {past.length}건 끝냄
        </button>
      )}
    </div>
  );
}

/** 이어가기 카드. 같은 장비면 세션을 바로 연다. 다른 장비면 HUB를 보고 새 세션에서 이어 간다. */
function ContinueCard({
  todo,
  hub,
  compact,
  done,
  onToggleDone,
}: {
  todo: Todo;
  hub: HubFile | null;
  compact?: boolean;
  done: boolean;
  onToggleDone: (on: boolean) => void;
}) {
  const origin = readOrigin(todo.origin);
  const projectTitle = hub?.projects.find((p) => p.slug === todo.project)?.title;
  const summary = summaryOf(todo.body);
  return (
    <article className={`cont-card${compact ? " compact" : ""}${done ? " checked" : ""}`}>
      <div className="cont-head">
        <input
          type="checkbox"
          className="check"
          checked={done}
          onChange={(e) => onToggleDone(e.target.checked)}
          aria-label={done ? "되돌리기" : "완료"}
        />
        <h3>{todo.title}</h3>
      </div>
      {summary && <p className="summary">{summary}</p>}
      <div className="cont-foot">
        <div className="meta">
          {projectTitle && <span className="tag project">{shortTitle(projectTitle)}</span>}
          {origin && <span className="tag">{origin.label}</span>}
          <span className="tag when">{since(todo.updatedAt || todo.createdAt)}</span>
        </div>
        <div className="cont-acts">
          {todo.project && (
            <a className="go" href={hubUrl(todo.project)} target="_blank" rel="noreferrer">
              HUB
            </a>
          )}
          <a className="go" href={todo.url} target="_blank" rel="noreferrer">
            이슈
          </a>
          {todo.project && <CopyPhrase text={`${todo.project} 이어가기`} />}
          {origin?.session && (
            <a
              className="open-session"
              href={origin.session}
              // cursor:// 링크는 새 탭 없이 앱으로 넘긴다. 위키 홈 iframe 안에서도 눌리게 _top
              target={origin.session.startsWith("cursor:") ? "_top" : "_blank"}
              rel="noreferrer"
            >
              세션 열기
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * 다른 장비나 새 세션에서 이어 갈 때 붙여 넣을 문장. 세션 링크는 담은 장비에서만 열린다.
 */
function CopyPhrase({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="act"
      title={text}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? "복사됨" : "새 세션용 문장"}
    </button>
  );
}

/** 끝낸 것 탭. 최근 7일과 그 이전으로 가르고 오래된 쪽은 접어 둔다. */
function DoneView({ entries, onReopened }: { entries: DoneEntry[]; onReopened: () => void }) {
  const [showOlder, setShowOlder] = useState(false);
  const { recent, older } = splitByRecency(entries, Date.now());

  return (
    <section className="done">
      <h2>
        최근 7일 <span className="count">{recent.length}</span>
      </h2>
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
    </section>
  );
}

/**
 * 할 일 한 줄. 평소엔 제목과 꼭 필요한 표시만 두고, 제목을 누르면 고치는 자리가 열린다.
 * 줄마다 버튼 다섯 개를 늘어놓았더니 60건이 화면 열 장을 넘었다.
 */
function Row({
  todo,
  today,
  hub,
  categories,
  colorOf,
  showCategory,
  done,
  onToggleDone,
  onChanged,
}: RowShared & {
  todo: Todo;
  showCategory?: boolean;
  done: boolean;
  onToggleDone: (done: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dating, setDating] = useState(false);
  // 시간까지 적힌 마감이면 시간 칸을 열어둔 채로 시작한다. 날짜만 고치다 시간을 지우지 않게.
  const [withTime, setWithTime] = useState(() => (todo.due?.length ?? 0) > 10);
  // 삭제는 한 번 눌러 묻고 다시 눌러야 실행한다. 훑다가 스쳐도 지워지지 않게.
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!asking) return;
    const t = setTimeout(() => setAsking(false), 5000);
    return () => clearTimeout(t);
  }, [asking]);
  const state = dueState(todo.due, today);
  const origin = readOrigin(todo.origin);
  const projectTitle = hub?.projects.find((p) => p.slug === todo.project)?.title;
  const summary = open ? summaryOf(todo.body) : "";

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
    <div
      className={`row${busy ? " busy" : ""}${done ? " checked" : ""}${open ? " open" : ""} p-${todo.priority}`}
    >
      <input
        type="checkbox"
        className="check"
        checked={done}
        onChange={(e) => onToggleDone(e.target.checked)}
        aria-label={done ? "되돌리기" : "완료"}
        disabled={busy}
      />
      <div className="body">
        <button className="title" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {todo.title}
        </button>
        <div className="meta">
          {showCategory && (
            <span className="cat" style={{ "--cat": colorOf(todo.category) } as React.CSSProperties}>
              <i className="dot" />
              {todo.category}
            </span>
          )}
          {todo.priority !== "보통" && <span className={`prio-tag p${todo.priority}`}>{todo.priority}</span>}
          {todo.inProgress && <span className="tag live">진행중</span>}
          {state && <span className={`due ${state}`}>{dueLabel(todo.due!, state)}</span>}
          {projectTitle && <span className="tag project">{shortTitle(projectTitle)}</span>}
          {todo.createdAt && <span className="tag when">{since(todo.createdAt)}</span>}
        </div>

        {open && (
          <div className="detail">
            {summary && <p className="summary">{summary}</p>}
            <div className="tools">
              <label>
                <span>우선순위</span>
                {/* 글자로 적는다. 점 하나로 뒀더니 무슨 뜻인지도, 누를 수 있는지도 안 보였다. */}
                <button
                  className={`prio p${todo.priority}`}
                  disabled={locked}
                  onClick={() => void run(() => setPriority(todo, nextPriority))}
                >
                  {todo.priority}
                </button>
              </label>

              <label>
                <span>카테고리</span>
                <select
                  value={todo.category === UNSORTED ? "" : todo.category}
                  disabled={locked}
                  onChange={(e) => void run(() => setCategoryLabel(todo, e.target.value || null))}
                >
                  <option value="">미분류</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>프로젝트</span>
                <select
                  value={todo.project ?? ""}
                  disabled={locked}
                  onChange={(e) => void run(() => setProject(todo, e.target.value || null))}
                >
                  <option value="">연결 없음</option>
                  {hub?.projects.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {tidy(p.title)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>마감</span>
                {dating ? (
                  <span className="due-edit">
                    <input
                      type={withTime ? "datetime-local" : "date"}
                      autoFocus
                      defaultValue={todo.due ? todo.due.replace(" ", "T") : ""}
                      onChange={(e) => {
                        const v = e.target.value; // 다 채워지기 전에는 빈 값이라 중간에 안 새어 나간다
                        setDating(false);
                        void run(() => setDue(todo, v ? v.replace("T", " ") : null));
                      }}
                      onBlur={() => setDating(false)}
                    />
                    <button
                      type="button"
                      className={withTime ? "chip on" : "chip"}
                      // 칩을 누를 때 입력칸이 blur되어 편집이 닫히는 걸 막는다
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setWithTime((v) => !v)}
                    >
                      시간
                    </button>
                  </span>
                ) : (
                  <span className="due-edit">
                    <button className="chip" disabled={locked} onClick={() => setDating(true)}>
                      {todo.due ?? "+ 마감"}
                    </button>
                    {todo.due && (
                      <button className="chip" disabled={locked} onClick={() => void run(() => setDue(todo, null))}>
                        비우기
                      </button>
                    )}
                  </span>
                )}
              </label>
            </div>

            <div className="links">
              <a className="go" href={todo.url} target="_blank" rel="noreferrer">
                이슈 #{todo.number}
              </a>
              {todo.project && (
                <a className="go" href={hubUrl(todo.project)} target="_blank" rel="noreferrer">
                  HUB
                </a>
              )}
              {origin &&
                (origin.session ? (
                  <a
                    className="go"
                    href={origin.session}
                    // cursor:// 링크는 새 탭 없이 앱으로 넘긴다. 위키 홈 iframe 안에서도 눌리게 _top
                    target={origin.session.startsWith("cursor:") ? "_top" : "_blank"}
                    rel="noreferrer"
                  >
                    {origin.label} 세션
                  </a>
                ) : (
                  <span className="dim">{origin.label}</span>
                ))}
              <span className="spacer" />
              {!done &&
                (asking ? (
                  <>
                    <button
                      className="act danger"
                      disabled={busy}
                      onClick={() => {
                        setAsking(false);
                        void run(() => dropTodo(todo.number));
                      }}
                    >
                      {busy ? "지우는 중" : "삭제"}
                    </button>
                    <button className="act" disabled={busy} onClick={() => setAsking(false)}>
                      취소
                    </button>
                  </>
                ) : (
                  <button className="act" disabled={busy} onClick={() => setAsking(true)}>
                    삭제
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
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
          <button
            className="primary"
            onClick={() =>
              inFrame()
                ? startLoginPopup((token) => {
                    setToken(token);
                    onSaved();
                  })
                : startLogin()
            }
          >
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
  initial,
  onAdded,
}: {
  today: string;
  hub: HubFile | null;
  categories: string[];
  /** 보고 있는 탭이나 카테고리. 거기서 담으면 그 카테고리로 들어간다 */
  initial: string | null;
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
  const chosen = category ?? (initial && categories.includes(initial) ? initial : null) ?? categories[0] ?? null;

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
        placeholder="새 할 일 담기"
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
  todos,
  sort,
  onSort,
  pulling,
  onPull,
}: {
  hub: HubFile;
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
          // 전부 접혀 나온다. 프로젝트가 50개를 넘어 펼쳐 두면 훑을 수가 없다. 실행 줄로
          // 끌어온 게 있는 프로젝트는 지금 손대는 프로젝트라 펼쳐 둔다.
          <details key={p.slug} open={active > 0}>
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
