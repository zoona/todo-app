import { describe, expect, it } from "vitest";
import { parseCallback } from "./auth";

describe("parseCallback", () => {
  it("code와 state를 뽑는다", () => {
    expect(parseCallback("?code=abc123&state=xyz")).toEqual({ code: "abc123", state: "xyz" });
  });

  it("둘 중 하나라도 없으면 로그인 콜백이 아니다", () => {
    expect(parseCallback("?code=abc123")).toBeNull();
    expect(parseCallback("?state=xyz")).toBeNull();
    expect(parseCallback("")).toBeNull();
    expect(parseCallback("?utm_source=x")).toBeNull();
  });

  it("다른 파라미터가 섞여 있어도 뽑는다", () => {
    expect(parseCallback("?foo=1&code=c&state=s&bar=2")).toEqual({ code: "c", state: "s" });
  });
});
