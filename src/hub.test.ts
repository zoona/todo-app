import { describe, expect, it } from "vitest";
import { ageDays, sortProjects, staleLabel, staleOf } from "./hub";
import type { HubProject } from "./types";

const NOW = Date.parse("2026-09-06T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86400000).toISOString();

function project(title: string, ...ages: number[]): HubProject {
  return {
    slug: title,
    title,
    items: ages.map((a) => ({ depth: 0, text: "일", date: daysAgo(a) })),
  };
}

describe("방치 나이", () => {
  it("날짜가 없으면 0 — 신호가 아니다", () => {
    expect(ageDays(null, NOW)).toBe(0);
    expect(ageDays(undefined, NOW)).toBe(0);
  });

  it("프로젝트 나이는 가장 오래 방치된 항목 기준", () => {
    expect(staleOf(project("a", 3, 40, 10), NOW)).toBe(40);
    expect(staleOf({ slug: "b", title: "b", items: [] }, NOW)).toBe(0);
  });

  it("주, 개월, 년으로 끊어 읽는다", () => {
    expect(staleLabel(21)).toBe("3주 방치");
    expect(staleLabel(40)).toBe("1개월 방치");
    expect(staleLabel(400)).toBe("1년 방치");
  });
});

describe("프로젝트 정렬", () => {
  const projects = [project("가", 5), project("나", 100), project("다", 40)];

  it("방치 오래된 것부터", () => {
    expect(sortProjects(projects, "stale", NOW).map((p) => p.title)).toEqual(["나", "다", "가"]);
  });

  it("이름순", () => {
    expect(sortProjects(projects, "name", NOW).map((p) => p.title)).toEqual(["가", "나", "다"]);
  });

  it("같은 나이는 이름으로 갈라 순서가 흔들리지 않는다", () => {
    const tied = [project("다", 10), project("가", 10), project("나", 10)];
    expect(sortProjects(tied, "stale", NOW).map((p) => p.title)).toEqual(["가", "나", "다"]);
  });

  it("원본 배열을 바꾸지 않는다", () => {
    const before = projects.map((p) => p.title);
    sortProjects(projects, "stale", NOW);
    expect(projects.map((p) => p.title)).toEqual(before);
  });
});
