import { describe, expect, it } from "vitest";
import { hostLabel, readOrigin, since } from "./devices";

describe("hostLabel", () => {
  it("hostname을 그대로 보여준다. .local만 뗀다", () => {
    expect(hostLabel("Vosne-Romanee.local")).toBe("Vosne-Romanee");
    expect(hostLabel("Vosne-Romanee")).toBe("Vosne-Romanee");
    expect(hostLabel("lambray")).toBe("lambray");
  });
});

describe("readOrigin", () => {
  it("장비와 세션을 가른다", () => {
    expect(readOrigin("Vosne-Romanee.local — 세션 https://claude.ai/code/session_017x")).toEqual({
      label: "Vosne-Romanee",
      session: "https://claude.ai/code/session_017x",
    });
  });

  it("세션이 없으면 이름만", () => {
    expect(readOrigin("웹앱")).toEqual({ label: "웹앱", session: null });
    expect(readOrigin("iPhone")).toEqual({ label: "iPhone", session: null });
  });

  it("세션 자리에 링크가 아닌 게 오면 링크로 안 만든다", () => {
    expect(readOrigin("lambray — 세션 abc123")).toEqual({ label: "lambray", session: null });
  });

  it("없으면 null", () => {
    expect(readOrigin(null)).toBeNull();
    expect(readOrigin("")).toBeNull();
  });
});

describe("since", () => {
  const now = new Date("2026-09-05T12:00:00Z");

  it("오늘과 어제를 가른다", () => {
    expect(since("2026-09-05T01:00:00Z", now)).toBe("오늘");
    expect(since("2026-09-04T01:00:00Z", now)).toBe("어제");
  });

  it("일, 주, 개월, 년", () => {
    expect(since("2026-09-01T12:00:00Z", now)).toBe("4일 전");
    expect(since("2026-08-20T12:00:00Z", now)).toBe("2주 전");
    expect(since("2026-06-05T12:00:00Z", now)).toBe("3개월 전");
    expect(since("2025-06-05T12:00:00Z", now)).toBe("1년 전");
  });

  it("미래 시각이 와도 안 터진다", () => {
    expect(since("2026-09-06T12:00:00Z", now)).toBe("오늘");
  });
});
