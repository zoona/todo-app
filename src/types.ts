export const UNSORTED = "미분류";
export const IN_PROGRESS = "진행중";

/** 시스템 라벨 — 카테고리도 아니고 할 일도 아니다. */
export const SYSTEM_LABELS = ["dashboard", "push", "config"] as const;

/** 라벨로 두는 건 높음과 낮음뿐. 안 붙으면 보통이라 평소엔 아무것도 안 눌러도 된다. */
export const HIGH = "높음";
export const LOW = "낮음";
export type Priority = "높음" | "보통" | "낮음";

/** 정렬용. 작을수록 먼저. */
export const PRIORITY_RANK: Record<Priority, number> = {
  높음: 0,
  보통: 1,
  낮음: 2,
};

export type Todo = {
  number: number;
  title: string;
  url: string;
  category: string; // 카테고리 라벨 이름, 없으면 미분류
  priority: Priority;
  project: string | null; // 프로젝트 slug
  inProgress: boolean;
  due: string | null; // YYYY-MM-DD 또는 YYYY-MM-DD HH:mm
  origin: string | null;
  createdAt: string;
  /** 닫힌 시각. 열려 있으면 null */
  closedAt: string | null;
  /** 댓글 수. 닫으며 남긴 기록이 여기 있어 읽을 게 있는지 알려준다. */
  comments: number;
  body: string;
};

export type HubProject = {
  slug: string;
  title: string;
  /** date는 그 줄이 마지막으로 바뀐 날. 오래된 쪽만 신호다 — 문서를 손보면 리셋된다. */
  items: { depth: number; text: string; date?: string | null }[];
  /** 끝낸 항목. date는 그 줄이 마지막으로 바뀐 날이라 대체로 완료 시점이다. */
  done?: { text: string; date?: string | null }[];
};

export type HubFile = {
  drawnAt: string;
  commit: string;
  commitDate: string;
  projects: HubProject[];
};

/** 한 세션이 무엇을 했나. 커밋과 이슈를 세션 ID로 묶은 것. */
export type SessionEntry = {
  id: string;
  /** 무엇으로 한 작업인가. Codex는 세션 링크가 없어 날짜로 묶인다. */
  tool: "claude" | "codex";
  /** 열어볼 링크. Codex는 없다 */
  url: string | null;
  /** 마지막 커밋 시각. 커밋이 없으면(이슈만 담은 세션) null */
  lastAt: string | null;
  lastSubject: string | null;
  commits: number;
  projects: { slug: string; count: number }[];
  /** 장비 이름. 이슈 출처 줄에서만 오므로 모를 수 있다 */
  host: string | null;
  /** 그 세션이 담은 열린 할 일. 목록 본체는 할 일 화면이 주인이라 번호와 제목만 */
  issues: { number: number; title: string }[];
};

/** 지금 붙들고 있는 것. 커밋 전에 끊긴 작업이라 커밋 목록에는 안 보인다. */
export type ProgressEntry = {
  host: string | null;
  session: string | null;
  cwd: string | null;
  /** 마지막으로 올린 시각 */
  at: string | null;
  lastSubject: string | null;
  /** 고치다 만 파일 경로. 내용은 담지 않는다 */
  dirty: string[];
  /** 커밋했지만 안 올린 것 */
  ahead: number;
};

export type SessionFile = {
  drawnAt: string;
  days: number;
  progress?: ProgressEntry[];
  sessions: SessionEntry[];
};
