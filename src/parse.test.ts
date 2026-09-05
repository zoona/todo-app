import { describe, expect, it } from "vitest";
import {
  categoryOf,
  compareTodos,
  dueState,
  parseDue,
  parseOrigin,
  parseProject,
  priorityOf,
  todayInSeoul,
  toTodo,
  withDue,
  withProject,
} from "./parse";
import type { Todo } from "./types";

describe("parseDue", () => {
  it("날짜만 있는 마감을 읽는다", () => {
    expect(parseDue("장 보기\n\n마감: 2026-09-10")).toBe("2026-09-10");
  });

  it("시간까지 있는 마감을 읽는다", () => {
    expect(parseDue("마감: 2026-09-10 14:00")).toBe("2026-09-10 14:00");
  });

  it("형식이 안 맞으면 무시한다", () => {
    expect(parseDue("마감: 다음주")).toBeNull();
    expect(parseDue("마감: 2026/09/10")).toBeNull();
    expect(parseDue("마감: 2026-09-10 25:00")).toBeNull();
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

describe("parseProject", () => {
  it("프로젝트 줄을 읽는다", () => {
    expect(parseProject("할 일\n\n프로젝트: model-serving-optimization")).toBe(
      "model-serving-optimization",
    );
  });

  it("없으면 null", () => {
    expect(parseProject("할 일")).toBeNull();
  });
});

describe("withDue", () => {
  it("마감이 없던 본문에 붙인다", () => {
    expect(withDue("장 보기", "2026-09-10")).toBe("장 보기\n\n마감: 2026-09-10");
  });

  it("이미 있으면 바꾼다. 중복으로 안 쌓인다", () => {
    const once = withDue("장 보기\n\n마감: 2026-09-01", "2026-09-10 09:30");
    expect(once).toBe("장 보기\n\n마감: 2026-09-10 09:30");
    expect(once.match(/마감:/g)).toHaveLength(1);
  });

  it("null이면 뺀다", () => {
    expect(withDue("장 보기\n\n마감: 2026-09-10", null)).toBe("장 보기");
  });

  it("다른 줄은 안 건드린다", () => {
    const body = "장 보기\n\n출처: iPhone\n프로젝트: ace\n마감: 2026-09-01";
    expect(withDue(body, "2026-09-10")).toBe(
      "장 보기\n\n출처: iPhone\n프로젝트: ace\n\n마감: 2026-09-10",
    );
  });

  it("빈 본문에도 붙는다", () => {
    expect(withDue("", "2026-09-10")).toBe("마감: 2026-09-10");
  });
});

describe("withProject", () => {
  it("붙이고 바꾸고 뺀다", () => {
    const added = withProject("할 일", "ace");
    expect(added).toBe("할 일\n\n프로젝트: ace");
    expect(withProject(added, "tech-tree")).toBe("할 일\n\n프로젝트: tech-tree");
    expect(withProject(added, null)).toBe("할 일");
  });

  it("마감 줄과 같이 있어도 각자 산다", () => {
    let body = withProject("할 일", "ace");
    body = withDue(body, "2026-09-10");
    expect(parseProject(body)).toBe("ace");
    expect(parseDue(body)).toBe("2026-09-10");
  });
});

describe("categoryOf / priorityOf", () => {
  it("카테고리 라벨을 고른다", () => {
    expect(categoryOf(["개인", "진행중"])).toBe("개인");
    expect(categoryOf([])).toBe("미분류");
  });

  it("우선순위는 라벨이 없으면 보통", () => {
    expect(priorityOf(["높음"])).toBe("높음");
    expect(priorityOf(["낮음"])).toBe("낮음");
    expect(priorityOf(["개인"])).toBe("보통");
  });
});

describe("toTodo", () => {
  it("이슈를 할 일로 바꾼다", () => {
    const todo = toTodo({
      number: 5,
      title: "치과 예약",
      html_url: "https://github.com/zoona/todo/issues/5",
      body: "출처: iPhone\n프로젝트: ace\n마감: 2026-09-10 14:00",
      labels: [{ name: "개인" }, { name: "진행중" }, { name: "높음" }],
    });
    expect(todo).toMatchObject({
      number: 5,
      category: "개인",
      priority: "높음",
      project: "ace",
      inProgress: true,
      due: "2026-09-10 14:00",
    });
  });
});

describe("dueState", () => {
  const today = "2026-09-05";

  it("지난 것은 overdue", () => {
    expect(dueState("2026-09-04", today)).toBe("overdue");
  });

  it("오늘은 today. 시간이 붙어도 오늘이다", () => {
    expect(dueState("2026-09-05", today)).toBe("today");
    expect(dueState("2026-09-05 23:00", today)).toBe("today");
  });

  it("일주일 안은 soon, 넘으면 later", () => {
    expect(dueState("2026-09-12", today)).toBe("soon");
    expect(dueState("2026-09-13", today)).toBe("later");
  });

  it("마감이 없으면 null", () => {
    expect(dueState(null, today)).toBeNull();
  });
});

describe("compareTodos", () => {
  const today = "2026-09-05";
  const base: Todo = {
    number: 1,
    title: "x",
    url: "u",
    category: "개인",
    priority: "보통",
    project: null,
    inProgress: false,
    due: null,
    origin: null,
    createdAt: "2026-09-05T00:00:00Z",
    body: "",
  };
  const make = (p: Partial<Todo>): Todo => ({ ...base, ...p });

  function order(list: Todo[]) {
    return [...list].sort((a, b) => compareTodos(a, b, today)).map((t) => t.title);
  }

  it("지난 것이 맨 앞", () => {
    expect(
      order([
        make({ title: "보통" }),
        make({ title: "지남", due: "2026-09-01" }),
      ]),
    ).toEqual(["지남", "보통"]);
  });

  it("지난 것 다음이 오늘", () => {
    expect(
      order([
        make({ title: "나중", due: "2026-09-20" }),
        make({ title: "오늘", due: "2026-09-05" }),
        make({ title: "지남", due: "2026-09-01" }),
      ]),
    ).toEqual(["지남", "오늘", "나중"]);
  });

  it("같은 급이면 우선순위가 가른다", () => {
    expect(
      order([
        make({ title: "낮음", priority: "낮음" }),
        make({ title: "높음", priority: "높음" }),
        make({ title: "보통" }),
      ]),
    ).toEqual(["높음", "보통", "낮음"]);
  });

  it("우선순위가 같으면 마감이 가까운 것 먼저. 마감 없는 건 뒤로", () => {
    expect(
      order([
        make({ title: "마감없음" }),
        make({ title: "늦게", due: "2026-09-20" }),
        make({ title: "빨리", due: "2026-09-10" }),
      ]),
    ).toEqual(["빨리", "늦게", "마감없음"]);
  });
});

describe("todayInSeoul", () => {
  it("UTC 자정 직후에도 서울 날짜로 준다", () => {
    expect(todayInSeoul(new Date("2026-09-05T15:30:00Z"))).toBe("2026-09-06");
  });
});
