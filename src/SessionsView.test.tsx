import { vi } from "vitest";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { SessionsView } from "./App";
import type { SessionFile } from "./types";

/** SSR은 텍스트 노드 경계에 <!-- -->를 넣는다. 사람이 보는 글자만 남긴다. */
const text = (html: string) => html.replace(/<!-- -->/g, "");

const NOW = new Date("2026-09-14T12:00:00+09:00");

function file(over: Partial<SessionFile> = {}): SessionFile {
  return {
    drawnAt: "2026-09-14 05:50 KST",
    days: 14,
    sessions: [
      {
        id: "01AA",
        url: "https://claude.ai/code/session_01AA",
        lastAt: "2026-09-14T09:00:00+09:00",
        lastSubject: "task-dashboard: 오늘 한 일",
        commits: 3,
        projects: [{ slug: "task-dashboard", count: 3 }],
        host: "LAMBRAY",
        issues: [{ number: 31, title: "할 일 하나" }],
      },
      {
        id: "01BB",
        url: "https://claude.ai/code/session_01BB",
        lastAt: "2026-09-09T09:00:00+09:00",
        lastSubject: "working: 며칠 전 일",
        commits: 1,
        projects: [{ slug: "working", count: 1 }],
        host: null,
        issues: [],
      },
    ],
    ...over,
  };
}

describe("SessionsView", () => {
  it("오늘 움직인 세션을 그린다", () => {
    vi.setSystemTime(NOW);
    const html = text(renderToString(<SessionsView file={file()} />));
    expect(html).toContain("LAMBRAY");
    expect(html).toContain("task-dashboard: 오늘 한 일");
    expect(html).toContain("task-dashboard 3");
  });

  it("조용한 세션도 처음부터 펼쳐 둔다 — 접어 두면 빈 화면처럼 보인다", () => {
    vi.setSystemTime(NOW);
    const html = text(renderToString(<SessionsView file={file()} />));
    expect(html).toContain("working: 며칠 전 일");
    expect(html).toContain("장비 모름");
  });

  it("담은 할 일을 번호로 잇는다 — 목록 본체는 안 그린다", () => {
    vi.setSystemTime(NOW);
    const html = text(renderToString(<SessionsView file={file()} />));
    expect(html).toContain("#31");
    expect(html).toContain("담은 할 일 1건");
    // 제목은 title 속성에만 있고 본문으로 나열하지 않는다
    expect(html).not.toContain(">할 일 하나<");
  });

  it("아직 못 받았으면 0건이 아니라 안내를 보여준다", () => {
    const html = text(renderToString(<SessionsView file={null} />));
    expect(html).toContain("새로고침");
    expect(html).not.toContain("오늘 움직인 것");
  });

  it("기준 시각을 밝힌다", () => {
    vi.setSystemTime(NOW);
    const html = text(renderToString(<SessionsView file={file()} />));
    expect(html).toContain("2026-09-14 05:50 KST");
    expect(html).toContain("최근 14일");
  });
});
