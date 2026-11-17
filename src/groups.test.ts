import { describe, expect, it } from "vitest";
import { shortTitle, bandOf, isStale, isToday, periodLabel, recurringOf, splitRecurring, summaryOf } from "./groups";
import type { Todo } from "./types";

const NOW = Date.parse("2026-11-17T00:00:00Z");
const ago = (d: number) => new Date(NOW - d * 86400000).toISOString();
const base: Todo = {
  number: 1,
  title: "x",
  url: "u",
  category: "업무",
  priority: "보통",
  project: null,
  inProgress: false,
  due: null,
  origin: null,
  createdAt: ago(1),
  updatedAt: ago(1),
  closedAt: null,
  comments: 0,
  body: "",
};
const make = (p: Partial<Todo>): Todo => ({ ...base, ...p });

describe("정기 할 일", () => {
  it("제목 끝 기간을 가른다", () => {
    expect(recurringOf("비용 승인하기 (2026-W47)")).toEqual({ base: "비용 승인하기", period: "2026-W47" });
    expect(recurringOf("AWS 데모 환경 비용 점검 (2026-11)")).toEqual({
      base: "AWS 데모 환경 비용 점검",
      period: "2026-11",
    });
    expect(recurringOf("셀로니스 기술 검토 (보고)")).toBeNull();
  });

  it("같은 제목을 묶고 기간 순으로 놓는다", () => {
    const { singles, groups } = splitRecurring([
      make({ number: 2, title: "비용 승인하기 (2026-W47)" }),
      make({ number: 3, title: "다른 일" }),
      make({ number: 4, title: "비용 승인하기 (2026-W45)" }),
    ]);
    expect(singles.map((t) => t.number)).toEqual([3]);
    expect(groups[0].items.map((t) => t.number)).toEqual([4, 2]);
    expect(periodLabel(groups[0].items[1].title)).toBe("W47");
  });
});

describe("나누기", () => {
  it("오늘 볼 것은 마감 일주일 안, 높음, 진행중", () => {
    expect(isToday(make({ due: "2026-11-20" }), "2026-11-17")).toBe(true);
    expect(isToday(make({ due: "2026-12-30" }), "2026-11-17")).toBe(false);
    expect(isToday(make({ priority: "높음" }), "2026-11-17")).toBe(true);
    expect(isToday(make({}), "2026-11-17")).toBe(false);
  });

  it("정리 후보는 한 달 넘게 안 바뀐 것, 마감과 이어가기와 정기는 뺀다", () => {
    expect(isStale(make({ updatedAt: ago(40) }), NOW)).toBe(true);
    expect(isStale(make({ updatedAt: ago(10) }), NOW)).toBe(false);
    expect(isStale(make({ updatedAt: ago(40), due: "2026-12-01" }), NOW)).toBe(false);
    expect(isStale(make({ updatedAt: ago(40), category: "이어가기" }), NOW)).toBe(false);
    expect(isStale(make({ updatedAt: ago(40), title: "비용 승인하기 (2026-W42)" }), NOW)).toBe(false);
  });

  it("담은 시점 묶음", () => {
    expect(bandOf(make({ createdAt: ago(2) }), NOW)).toBe("이번 주");
    expect(bandOf(make({ createdAt: ago(20) }), NOW)).toBe("이번 달");
    expect(bandOf(make({ createdAt: ago(60) }), NOW)).toBe("그 이전");
  });

  it("프로젝트 이름 앞부분과 월 기간", () => {
    expect(shortTitle("Deck Engine — 주제를 가리지 않는 발표 엔진")).toBe("Deck Engine");
    expect(periodLabel("AWS 점검 (2026-11)")).toBe("11월");
  });

  it("본문 첫 줄은 필드 줄과 불릿을 건너뛴다", () => {
    expect(summaryOf("\n- 불릿\n무엇을 왜\n\n출처: x")).toBe("무엇을 왜");
    expect(summaryOf("출처: 웹앱")).toBe("");
  });
});
