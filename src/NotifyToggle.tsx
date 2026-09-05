import { useEffect, useState } from "react";
import { dropSubscription, saveSubscription } from "./api";
import { deviceLabel, urlBase64ToUint8Array } from "./push";
import { VAPID_PUBLIC_KEY } from "./vapid";

type State = "unsupported" | "not-installed" | "off" | "on" | "denied";

/** iOS는 홈 화면에 담은 앱에서만 푸시를 받는다. 사파리 탭에서는 구독 자체가 안 된다. */
function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function NotifyToggle() {
  const [state, setState] = useState<State>("off");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !VAPID_PUBLIC_KEY) {
        setState("unsupported");
        return;
      }
      if (isIos() && !isStandalone()) {
        setState("not-installed");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })();
  }, []);

  async function turnOn() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const json = sub.toJSON() as { endpoint?: string; keys?: Record<string, string> };
      await saveSubscription({
        endpoint: json.endpoint!,
        keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
        label: deviceLabel(),
        addedAt: new Date().toISOString(),
      });
      setState("on");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await dropSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (state === "unsupported") return null;

  return (
    <div className="notify">
      {state === "not-installed" && (
        <p className="hint">
          알림을 받으려면 공유 버튼에서 <b>홈 화면에 추가</b>를 먼저 하세요. iOS는 홈 화면에
          담은 앱에서만 알림이 옵니다.
        </p>
      )}
      {state === "denied" && (
        <p className="hint">
          알림이 차단돼 있습니다. 설정에서 이 사이트의 알림을 허용해야 켤 수 있습니다.
        </p>
      )}
      {(state === "off" || state === "on") && (
        <button className="ghost" onClick={() => void (state === "on" ? turnOff() : turnOn())} disabled={busy}>
          {busy ? "..." : state === "on" ? "알림 끄기" : "알림 켜기"}
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
