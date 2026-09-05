import { describe, expect, it } from "vitest";
import { fromHub, fromTodos, splitByRecency, type DoneEntry } from "./done";
import type { HubFile, Todo } from "./types";

const NOW = Date.parse("2026-09-06T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86400000).toISOString();

function entry(title: string, at: string | null): DoneEntry {
  return { key: title, title, at };
}

describe("최근과 그 이전 가르기", () => {
  it("7일 안이면 최근, 넘으면 그 이전", () => {
    const { recent, older } = splitByRecency(
      [entry("어제", daysAgo(1)), entry("한달전", daysAgo(30)), entry("엿새전", daysAgo(6))],
      NOW,
    );
    expect(recent.map((e) => e.title)).toEqual(["어제", "엿새전"]);
    expect(older.map((e) => e.title)).toEqual(["한달전"]);
  });

  it("최근은 최신순", () => {
    const { recent } = splitByRecency(
      [entry("사흘전", daysAgo(3)), entry("오늘", daysAgo(0)), entry("엿새전", daysAgo(6))],
      NOW,
    );
    expect(recent.map((e) => e.title)).toEqual(["오늘", "사흘전", "엿새전"]);
  });

  it("날짜를 모르면 최근이 아니라 그 이전으로 간다", () => {
    const { recent, older } = splitByRecency([entry("모름", null), entry("어제", daysAgo(1))], NOW);
    expect(recent.map((e) => e.title)).toEqual(["어제"]);
    expect(older.map((e) => e.title)).toEqual(["모름"]);
  });

  it("경계값 — 정확히 7일 전은 그 이전", () => {
    const { recent, older } = splitByRecency([entry("딱7일", daysAgo(7.001))], NOW);
    expect(recent).toHaveLength(0);
    expect(older).toHaveLength(1);
  });

  it("원본을 바꾸지 않는다", () => {
    const list = [entry("b", daysAgo(1)), entry("a", daysAgo(2))];
    splitByRecency(list, NOW);
    expect(list.map((e) => e.title)).toEqual(["b", "a"]);
  });
});

describe("두 곳에서 모으기", () => {
  it("닫힌 이슈는 되돌릴 수 있게 todo를 달고 온다", () => {
    const t = { number: 5, title: "끝낸 일", closedAt: daysAgo(1) } as Todo;
    const [e] = fromTodos([t]);
    expect(e.title).toBe("끝낸 일");
    expect(e.at).toBe(daysAgo(1));
    expect(e.todo?.number).toBe(5);
    expect(e.project).toBeUndefined();
  });

  it("백로그 체크 항목은 프로젝트를 달고 오고 되돌리기는 없다", () => {
    const hub = {
      projects: [
        { slug: "s", title: "샘플", items: [], done: [{ text: "끝난 것", date: "2026-09-01" }] },
      ],
    } as unknown as HubFile;
    const [e] = fromHub(hub);
    expect(e.title).toBe("끝난 것");
    expect(e.project?.slug).toBe("s");
    expect(e.todo).toBeUndefined();
  });

  it("done이 없는 프로젝트와 hub 자체가 없는 경우", () => {
    const hub = { projects: [{ slug: "s", title: "샘플", items: [] }] } as unknown as HubFile;
    expect(fromHub(hub)).toEqual([]);
    expect(fromHub(null)).toEqual([]);
  });
});
