import { describe, expect, it } from "vitest";
import {
  deviceLabel,
  parseSubscriptions,
  remove,
  renderSubscriptions,
  upsert,
  urlBase64ToUint8Array,
  type PushSubscriptionRecord,
} from "./push";

const sub = (endpoint: string, label = "iPhone"): PushSubscriptionRecord => ({
  endpoint,
  keys: { p256dh: "p", auth: "a" },
  label,
  addedAt: "2026-09-05T10:00:00Z",
});

describe("parseSubscriptions / renderSubscriptions", () => {
  it("쓴 걸 그대로 다시 읽는다", () => {
    const subs = [sub("https://a"), sub("https://b", "Mac")];
    expect(parseSubscriptions(renderSubscriptions(subs))).toEqual(subs);
  });

  it("빈 목록도 왕복한다", () => {
    expect(parseSubscriptions(renderSubscriptions([]))).toEqual([]);
  });

  it("본문이 없거나 펜스가 없으면 빈 목록", () => {
    expect(parseSubscriptions(null)).toEqual([]);
    expect(parseSubscriptions("")).toEqual([]);
    expect(parseSubscriptions("설명만 있고 JSON은 없음")).toEqual([]);
  });

  it("JSON이 깨져 있어도 안 터진다", () => {
    expect(parseSubscriptions("```json\n{망가짐\n```")).toEqual([]);
  });

  it("배열이 아니면 빈 목록", () => {
    expect(parseSubscriptions('```json\n{"a":1}\n```')).toEqual([]);
  });

  it("설명 문구가 앞에 붙어 있어도 읽는다", () => {
    const body = renderSubscriptions([sub("https://a")]);
    expect(body.startsWith("웹 푸시 구독")).toBe(true);
    expect(parseSubscriptions(body)).toHaveLength(1);
  });

  it("기존 본문을 주면 구독 블록만 갈아끼우고 나머지는 남긴다", () => {
    const before = [
      "설명 줄",
      "",
      "```json",
      JSON.stringify([sub("https://a")], null, 1),
      "```",
      "",
      "보낸 기록",
      "",
      "```sent",
      '{"5":"2026-09-10 14:00"}',
      "```",
    ].join("\n");

    const after = renderSubscriptions([sub("https://b", "Mac")], before);

    expect(parseSubscriptions(after)).toEqual([sub("https://b", "Mac")]);
    expect(after).toContain("```sent");
    expect(after).toContain('"5":"2026-09-10 14:00"');
    expect(after).toContain("설명 줄");
  });

  it("기존 본문에 구독 블록이 없으면 새로 쓴다", () => {
    const after = renderSubscriptions([sub("https://a")], "아무 설명");
    expect(parseSubscriptions(after)).toHaveLength(1);
  });
});

describe("upsert / remove", () => {
  it("같은 endpoint는 하나만 남는다", () => {
    const first = sub("https://a", "iPhone");
    const again = { ...sub("https://a", "iPhone"), addedAt: "2026-09-06T00:00:00Z" };
    const out = upsert([first], again);
    expect(out).toHaveLength(1);
    expect(out[0].addedAt).toBe("2026-09-06T00:00:00Z");
  });

  it("다른 endpoint는 같이 남는다", () => {
    expect(upsert([sub("https://a")], sub("https://b", "Mac"))).toHaveLength(2);
  });

  it("endpoint로 지운다", () => {
    expect(remove([sub("https://a"), sub("https://b")], "https://a")).toEqual([sub("https://b")]);
  });
});

describe("urlBase64ToUint8Array", () => {
  it("패딩이 없는 base64url을 바이트로 바꾼다", () => {
    // "hello" = aGVsbG8
    expect(Array.from(urlBase64ToUint8Array("aGVsbG8"))).toEqual([104, 101, 108, 108, 111]);
  });

  it("- 와 _ 를 되돌린다", () => {
    // 0xfb 0xff 0xbf = "-_-_" 계열. 왕복만 확인한다.
    expect(urlBase64ToUint8Array("--__").length).toBe(3);
  });
});

describe("deviceLabel", () => {
  it("기기를 알아본다", () => {
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)")).toBe("iPhone");
    expect(deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X)")).toBe("Mac");
    expect(deviceLabel("어디에도 안 걸리는 값")).toBe("기타");
  });
});
