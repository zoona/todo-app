/**
 * 웹 푸시 구독을 GitHub 이슈 하나에 모아둔다.
 *
 * 별도 저장소를 두지 않으려는 것이다. `push` 라벨이 붙은 이슈의 본문에 JSON 배열을
 * 코드 펜스로 넣어두면, 앱은 REST로 읽고 쓰고 Actions는 같은 이슈를 읽어 발송한다.
 */

const FENCE_START = "```json";
const FENCE_END = "```";

export type PushSubscriptionRecord = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** 어느 기기에서 켰는지. 나중에 지울 때 사람이 알아보려고 둔다. */
  label: string;
  addedAt: string;
};

/** 이슈 본문의 코드 펜스에서 구독 목록을 꺼낸다. 깨져 있으면 빈 목록. */
export function parseSubscriptions(body: string | null | undefined): PushSubscriptionRecord[] {
  if (!body) return [];
  const start = body.indexOf(FENCE_START);
  if (start === -1) return [];
  const from = start + FENCE_START.length;
  const end = body.indexOf(FENCE_END, from);
  if (end === -1) return [];
  try {
    const parsed = JSON.parse(body.slice(from, end));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * 구독 목록을 담은 이슈 본문을 만든다.
 *
 * 기존 본문을 주면 구독 블록만 갈아끼우고 나머지는 그대로 둔다. 워크플로가 같은
 * 이슈에 발송 기록을 붙여두기 때문에, 통째로 새로 쓰면 그 기록이 날아간다.
 */
export function renderSubscriptions(
  subs: PushSubscriptionRecord[],
  previous?: string | null,
): string {
  const json = [FENCE_START, JSON.stringify(subs, null, 1), FENCE_END].join("\n");

  if (previous) {
    const start = previous.indexOf(FENCE_START);
    if (start !== -1) {
      const end = previous.indexOf(FENCE_END, start + FENCE_START.length);
      if (end !== -1) {
        return previous.slice(0, start) + json + previous.slice(end + FENCE_END.length);
      }
    }
  }

  return [
    "웹 푸시 구독을 담아두는 이슈입니다. 워크플로가 여기를 읽어 알림을 보냅니다.",
    "사람이 손으로 고치지 마세요. 알림을 끄려면 앱에서 끄면 이 목록에서 빠집니다.",
    "",
    json,
  ].join("\n");
}

/** 같은 endpoint는 하나만 남긴다. 브라우저가 구독을 새로 발급하면 옛 것은 버린다. */
export function upsert(
  subs: PushSubscriptionRecord[],
  next: PushSubscriptionRecord,
): PushSubscriptionRecord[] {
  return [...subs.filter((s) => s.endpoint !== next.endpoint), next];
}

export function remove(
  subs: PushSubscriptionRecord[],
  endpoint: string,
): PushSubscriptionRecord[] {
  return subs.filter((s) => s.endpoint !== endpoint);
}

/**
 * VAPID 공개키는 base64url 문자열로 오는데 구독 API는 바이트 배열을 받는다.
 * ArrayBuffer로 명시해 두지 않으면 SharedArrayBuffer까지 허용되는 타입이 되어
 * applicationServerKey에 그대로 못 넣는다.
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/** 이 기기를 알아볼 이름. 지울 때 어느 기기인지 보이게 한다. */
export function deviceLabel(ua: string = navigator.userAgent): string {
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "기타";
}
