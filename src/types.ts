export const CATEGORIES = ["일", "개인", "학습", "아이디어"] as const;
export type Category = (typeof CATEGORIES)[number];

export const UNSORTED = "미분류";
export const IN_PROGRESS = "진행중";
export const SYSTEM_LABEL = "dashboard";

export type Todo = {
  number: number;
  title: string;
  url: string;
  category: Category | typeof UNSORTED;
  inProgress: boolean;
  due: string | null; // YYYY-MM-DD
  origin: string | null;
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
