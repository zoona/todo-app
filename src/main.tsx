import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // 위키 홈 iframe 안에서는 저장소가 따로 갈라져 옛 서비스 워커가 남아 옛 화면이 떴다(2026-11-17).
    // sw.js는 HTTP 캐시를 거치지 않고 받고, 열 때마다 새 버전이 있는지 확인한다.
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: "none" })
      .then((reg) => reg.update())
      .catch(() => {});
  });
}
