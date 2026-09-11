import { describe, expect, it } from "vitest";
import { hostLabel, idleDays, projectSummary, splitByActivity } from "./sessions";
import type { SessionEntry } from "./types";

const NOW = Date.parse("2026-09-11T12:00:00+09:00");

function entry(over: Partial<SessionEntry> = {}): SessionEntry {
  return {
    id: "01AA",
    url: "https://claude.ai/code/session_01AA",
    lastAt: "2026-09-11T11:00:00+09:00",
    lastSubject: "task-dashboard: 무언가 함",
    commits: 3,
    projects: [{ slug: "task-dashboard", count: 3 }],
    host: "LAMBRAY",
    issues: [],
    ...over,
  };
}

describe("idleDays", () => {
  it("마지막 활동으로부터 며칠인지 센다", () => {
    expect(idleDays(entry(), NOW)).toBe(0);
    expect(idleDays(entry({ lastAt: "2026-09-08T11:00:00+09:00" }), NOW)).toBe(3);
  });

  it("커밋이 없는 세션은 모르는 것이라 null", () => {
    expect(idleDays(entry({ lastAt: null }), NOW)).toBeNull();
  });

  it("시각이 깨져 있어도 터지지 않는다", () => {
    expect(idleDays(entry({ lastAt: "어제쯤" }), NOW)).toBeNull();
  });
});

describe("splitByActivity", () => {
  it("하루 안에 움직인 것만 최근으로 본다", () => {
    const recent = entry({ id: "01AA" });
    const old = entry({ id: "01BB", lastAt: "2026-09-05T11:00:00+09:00" });
    const { active, quiet } = splitByActivity([recent, old], NOW);
    expect(active.map((e) => e.id)).toEqual(["01AA"]);
    expect(quiet.map((e) => e.id)).toEqual(["01BB"]);
  });

  it("커밋이 없는 세션은 조용한 쪽으로", () => {
    const { active, quiet } = splitByActivity([entry({ lastAt: null })], NOW);
    expect(active).toHaveLength(0);
    expect(quiet).toHaveLength(1);
  });

  it("준 순서를 바꾸지 않는다", () => {
    const a = entry({ id: "01AA" });
    const b = entry({ id: "01BB" });
    expect(splitByActivity([a, b], NOW).active.map((e) => e.id)).toEqual(["01AA", "01BB"]);
  });
});

describe("projectSummary", () => {
  it("많으면 앞의 둘만 두고 나머지는 개수로 접는다", () => {
    const e = entry({
      projects: [
        { slug: "token-value-share", count: 138 },
        { slug: "knowledge", count: 3 },
        { slug: "working", count: 2 },
        { slug: "team-ops", count: 1 },
      ],
    });
    expect(projectSummary(e)).toBe("token-value-share 138, knowledge 3 외 2");
  });

  it("둘 이하면 그대로", () => {
    expect(projectSummary(entry())).toBe("task-dashboard 3");
  });

  it("커밋이 없으면 빈 문자열", () => {
    expect(projectSummary(entry({ projects: [] }))).toBe("");
  });
});

describe("hostLabel", () => {
  it("장비를 모르면 모른다고 적는다", () => {
    expect(hostLabel(entry({ host: null }))).toBe("장비 모름");
    expect(hostLabel(entry())).toBe("LAMBRAY");
  });
});
