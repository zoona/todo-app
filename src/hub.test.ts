import { describe, expect, it } from "vitest";
import { ageDays, sortProjects, splitItem, staleLabel, staleOf } from "./hub";
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

describe("앞머리와 상세 가르기", () => {
  it("짧은 항목은 가르지 않는다", () => {
    expect(splitItem("발표 덱 골자 잡기")).toEqual({ head: "발표 덱 골자 잡기", rest: "" });
  });

  it("긴 항목은 첫 구분자에서 가른다", () => {
    const long = "인가 결함 전달 — AI 모델 설정 수정의 대상 프로젝트 재인가가 누락되어 릴리스 리뷰에서 발견됨";
    expect(splitItem(long).head).toBe("인가 결함 전달");
    expect(splitItem(long).rest.startsWith("AI 모델 설정")).toBe(true);
  });

  it("여는 괄호는 상세 쪽에 남긴다", () => {
    const t = "미확정 질문 해소 (규모, xPU 벤더, 오케스트레이터, L8과의 경계, 팀 지원 범위를 정해야 한다)";
    expect(splitItem(t).head).toBe("미확정 질문 해소");
    expect(splitItem(t).rest.startsWith("(규모")).toBe(true);
  });

  it("콜론도 가른다", () => {
    const t = "핵심정리 보강: 아키텍처 상세와 KG 대 RAG 실험 결과, 데이터 리니지까지 채워 넣어야 한다";
    expect(splitItem(t).head).toBe("핵심정리 보강");
  });

  it("앞머리가 너무 짧거나 구분자가 늦게 오면 가르지 않는다", () => {
    const t = "가 — " + "긴 설명".repeat(20);
    expect(splitItem(t).rest).toBe("");
  });

  it("버전 번호의 점에서는 갈리지 않는다", () => {
    const t = "빌드 v0.1.8 릴리스에서 발견된 문제를 고쳐야 하고 그 다음 릴리스에 반영하기로 정했다";
    expect(splitItem(t).head).toBe(t);
  });
});
