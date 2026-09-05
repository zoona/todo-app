import { describe, expect, it } from "vitest";
import {
  addCategory,
  DEFAULT_CONFIG,
  moveCategory,
  orderIndex,
  parseConfig,
  removeCategory,
  renameCategory,
  renderConfig,
  withOrder,
  type AppConfig,
} from "./config";

const cfg: AppConfig = {
  categories: ["업무", "개인", "학습"],
  order: { 업무: [9, 6] },
};

describe("parseConfig / renderConfig", () => {
  it("쓴 걸 그대로 다시 읽는다", () => {
    expect(parseConfig(renderConfig(cfg))).toEqual(cfg);
  });

  it("기본 설정도 왕복한다", () => {
    expect(parseConfig(renderConfig(DEFAULT_CONFIG))).toEqual(DEFAULT_CONFIG);
  });

  it("본문이 없거나 깨졌으면 null", () => {
    expect(parseConfig(null)).toBeNull();
    expect(parseConfig("설명만")).toBeNull();
    expect(parseConfig("```json\n{깨짐\n```")).toBeNull();
    expect(parseConfig('```json\n{"order":{}}\n```')).toBeNull(); // categories 없음
  });
});

describe("카테고리 조작", () => {
  it("위아래로 옮긴다. 끝이면 그대로", () => {
    expect(moveCategory(cfg, "개인", -1).categories).toEqual(["개인", "업무", "학습"]);
    expect(moveCategory(cfg, "업무", -1).categories).toEqual(["업무", "개인", "학습"]);
    expect(moveCategory(cfg, "학습", 1).categories).toEqual(["업무", "개인", "학습"]);
  });

  it("이름을 바꾸면 순서 기록도 따라온다", () => {
    const out = renameCategory(cfg, "업무", "회사");
    expect(out.categories).toEqual(["회사", "개인", "학습"]);
    expect(out.order["회사"]).toEqual([9, 6]);
    expect(out.order["업무"]).toBeUndefined();
  });

  it("지우면 순서 기록도 지운다", () => {
    const out = removeCategory(cfg, "업무");
    expect(out.categories).toEqual(["개인", "학습"]);
    expect(out.order["업무"]).toBeUndefined();
  });

  it("추가는 뒤에, 중복은 무시", () => {
    expect(addCategory(cfg, "아이디어").categories).toEqual(["업무", "개인", "학습", "아이디어"]);
    expect(addCategory(cfg, "업무")).toBe(cfg);
  });
});

describe("수동 정렬", () => {
  it("순서에 있으면 그 위치, 없으면 뒤로", () => {
    expect(orderIndex(cfg, "업무", 9)).toBe(0);
    expect(orderIndex(cfg, "업무", 6)).toBe(1);
    expect(orderIndex(cfg, "업무", 4)).toBe(Number.POSITIVE_INFINITY);
    expect(orderIndex(cfg, "개인", 1)).toBe(Number.POSITIVE_INFINITY);
  });

  it("드래그 결과를 통째로 저장한다", () => {
    const out = withOrder(cfg, "업무", [4, 9, 6]);
    expect(out.order["업무"]).toEqual([4, 9, 6]);
    expect(cfg.order["업무"]).toEqual([9, 6]); // 원본 불변
  });
});
