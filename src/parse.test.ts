import { describe, expect, it } from "vitest";
import {
  categoryOf,
  dueState,
  parseDue,
  parseOrigin,
  todayInSeoul,
  toTodo,
  withDue,
} from "./parse";

describe("parseDue", () => {
  it("마감 줄을 읽는다", () => {
    expect(parseDue("장 보기\n\n마감: 2026-09-10")).toBe("2026-09-10");
  });

  it("형식이 안 맞으면 무시한다", () => {
    expect(parseDue("마감: 다음주")).toBeNull();
    expect(parseDue("마감: 2026/09/10")).toBeNull();
  });

  it("줄이 없거나 본문이 비면 null", () => {
    expect(parseDue("그냥 메모")).toBeNull();
    expect(parseDue(null)).toBeNull();
    expect(parseDue("")).toBeNull();
  });
});

describe("parseOrigin", () => {
  it("출처 줄을 그대로 읽는다", () => {
    expect(parseOrigin("할 일\n\n출처: Vosne-Romanee.local — 세션 https://x")).toBe(
      "Vosne-Romanee.local — 세션 https://x",
    );
  });
});

describe("withDue", () => {
  it("마감이 없던 본문에 붙인다", () => {
    expect(withDue("장 보기", "2026-09-10")).toBe("장 보기\n\n마감: 2026-09-10");
  });

  it("이미 있으면 바꾼다. 중복으로 안 쌓인다", () => {
    const once = withDue("장 보기\n\n마감: 2026-09-01", "2026-09-10");
    expect(once).toBe("장 보기\n\n마감: 2026-09-10");
    expect(once.match(/마감:/g)).toHaveLength(1);
  });

  it("null이면 뺀다", () => {
    expect(withDue("장 보기\n\n마감: 2026-09-10", null)).toBe("장 보기");
  });

  it("출처 줄은 안 건드린다", () => {
    const body = "장 보기\n\n출처: iPhone\n마감: 2026-09-01";
    expect(withDue(body, "2026-09-10")).toBe("장 보기\n\n출처: iPhone\n\n마감: 2026-09-10");
  });

  it("빈 본문에도 붙는다", () => {
    expect(withDue("", "2026-09-10")).toBe("마감: 2026-09-10");
  });
});

describe("categoryOf", () => {
  it("카테고리 라벨을 고른다", () => {
    expect(categoryOf(["개인", "진행중"])).toBe("개인");
  });

  it("없으면 미분류", () => {
    expect(categoryOf(["진행중"])).toBe("미분류");
    expect(categoryOf([])).toBe("미분류");
  });
});

describe("toTodo", () => {
  it("이슈를 할 일로 바꾼다", () => {
    const todo = toTodo({
      number: 5,
      title: "치과 예약",
      html_url: "https://github.com/zoona/todo/issues/5",
      body: "출처: iPhone\n마감: 2026-09-10",
      labels: [{ name: "개인" }, { name: "진행중" }],
    });
    expect(todo).toMatchObject({
      number: 5,
      title: "치과 예약",
      category: "개인",
      inProgress: true,
      due: "2026-09-10",
      origin: "iPhone",
    });
  });

  it("라벨이 문자열로 와도 읽는다", () => {
    const todo = toTodo({
      number: 6,
      title: "x",
      html_url: "u",
      body: null,
      labels: ["학습"],
    });
    expect(todo.category).toBe("학습");
    expect(todo.due).toBeNull();
  });
});

describe("dueState", () => {
  const today = "2026-09-05";

  it("지난 것은 overdue", () => {
    expect(dueState("2026-09-04", today)).toBe("overdue");
  });

  it("오늘은 today", () => {
    expect(dueState("2026-09-05", today)).toBe("today");
  });

  it("일주일 안은 soon, 넘으면 later", () => {
    expect(dueState("2026-09-12", today)).toBe("soon");
    expect(dueState("2026-09-13", today)).toBe("later");
  });

  it("마감이 없으면 null", () => {
    expect(dueState(null, today)).toBeNull();
  });
});

describe("todayInSeoul", () => {
  it("UTC 자정 직후에도 서울 날짜로 준다", () => {
    // 2026-09-05T15:30Z = 서울 2026-09-06 00:30
    expect(todayInSeoul(new Date("2026-09-05T15:30:00Z"))).toBe("2026-09-06");
  });
});
