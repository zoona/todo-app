// 앱 껍데기만 캐시한다. 할 일 데이터는 localStorage 캐시가 맡는다.
const CACHE = "todo-shell-v1";
const HOME = "/todo-app/";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([HOME, `${HOME}index.html`])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // API 호출은 절대 캐시하지 않는다. 토큰이 실린 응답이다.
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request).then((hit) => hit ?? caches.match(HOME))),
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "할 일", body: "" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: `${HOME}icon-192.png`,
      badge: `${HOME}icon-192.png`,
      tag: data.tag || "todo",
      renotify: true,
      data: { url: HOME },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(HOME) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(HOME);
    }),
  );
});
