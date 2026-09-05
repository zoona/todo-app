export const CATEGORIES = ["일", "개인", "학습", "아이디어"] as const;
export type Category = (typeof CATEGORIES)[number];

export const UNSORTED = "미분류";
export const IN_PROGRESS = "진행중";
export const SYSTEM_LABEL = "dashboard";

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
  category: Category | typeof UNSORTED;
  priority: Priority;
  project: string | null; // 프로젝트 slug
  inProgress: boolean;
  due: string | null; // YYYY-MM-DD 또는 YYYY-MM-DD HH:mm
  origin: string | null;
  createdAt: string;
  body: string;
};

export type HubProject = {
  slug: string;
  title: string;
  items: { depth: number; text: string }[];
};

export type HubFile = {
  drawnAt: string;
  commit: string;
  commitDate: string;
  projects: HubProject[];
};
