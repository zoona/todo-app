/**
 * 앱 설정 — 카테고리 목록과 수동 정렬 순서.
 *
 * `config` 라벨이 붙은 이슈 본문에 JSON으로 둔다. 화면에만 있는 상태를 만들지
 * 않으려는 것 — 앱, 대시보드 스크립트, 클로드 세션이 전부 같은 정본을 읽는다.
 * 카테고리의 실체는 GitHub 라벨이고, 이 설정은 "어떤 라벨이 카테고리이고
 * 어떤 순서로 보여줄지"를 정한다.
 */

const FENCE_START = "```json";
const FENCE_END = "```";

export type AppConfig = {
  /** 카테고리 라벨 이름, 보여줄 순서대로 */
  categories: string[];
  /** 카테고리별 수동 정렬 — 이슈 번호를 보여줄 순서대로. 없는 번호는 뒤에 붙는다 */
  order: Record<string, number[]>;
};

export const DEFAULT_CONFIG: AppConfig = {
  categories: ["업무", "개인", "학습", "아이디어"],
  order: {},
};

export function parseConfig(body: string | null | undefined): AppConfig | null {
  if (!body) return null;
  const start = body.indexOf(FENCE_START);
  if (start === -1) return null;
  const end = body.indexOf(FENCE_END, start + FENCE_START.length);
  if (end === -1) return null;
  try {
    const raw = JSON.parse(body.slice(start + FENCE_START.length, end));
    if (!Array.isArray(raw.categories)) return null;
    return {
      categories: raw.categories.filter((c: unknown) => typeof c === "string"),
      order: raw.order && typeof raw.order === "object" ? raw.order : {},
    };
  } catch {
    return null;
  }
}

export function renderConfig(cfg: AppConfig): string {
  return [
    "앱 설정을 담아두는 이슈입니다. 카테고리 목록과 순서, 항목의 수동 정렬이 들어 있습니다.",
    "앱의 카테고리 관리와 드래그 정렬이 여기를 고칩니다. 손으로 고쳐도 되지만 형식을 지켜야 합니다.",
    "",
    FENCE_START,
    JSON.stringify(cfg, null, 1),
    FENCE_END,
  ].join("\n");
}

/** 카테고리를 위나 아래로 한 칸. 끝이면 그대로. */
export function moveCategory(cfg: AppConfig, name: string, dir: -1 | 1): AppConfig {
  const i = cfg.categories.indexOf(name);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= cfg.categories.length) return cfg;
  const next = [...cfg.categories];
  [next[i], next[j]] = [next[j], next[i]];
  return { ...cfg, categories: next };
}

export function renameCategory(cfg: AppConfig, from: string, to: string): AppConfig {
  const order = { ...cfg.order };
  if (order[from]) {
    order[to] = order[from];
    delete order[from];
  }
  return {
    categories: cfg.categories.map((c) => (c === from ? to : c)),
    order,
  };
}

export function removeCategory(cfg: AppConfig, name: string): AppConfig {
  const order = { ...cfg.order };
  delete order[name];
  return { categories: cfg.categories.filter((c) => c !== name), order };
}

export function addCategory(cfg: AppConfig, name: string): AppConfig {
  if (cfg.categories.includes(name)) return cfg;
  return { ...cfg, categories: [...cfg.categories, name] };
}

/**
 * 수동 순서를 반영한 정렬 인덱스. 순서 배열에 있으면 그 위치, 없으면 뒤(Infinity).
 * 같은 값끼리는 호출 쪽의 기본 정렬(compareTodos)이 가른다.
 */
export function orderIndex(cfg: AppConfig, category: string, number: number): number {
  const i = (cfg.order[category] ?? []).indexOf(number);
  return i === -1 ? Number.POSITIVE_INFINITY : i;
}

/** 드래그 결과를 저장한다 — 그 카테고리의 화면 순서 전체를 번호 배열로. */
export function withOrder(cfg: AppConfig, category: string, numbers: number[]): AppConfig {
  return { ...cfg, order: { ...cfg.order, [category]: numbers } };
}
