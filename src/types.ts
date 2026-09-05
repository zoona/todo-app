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
