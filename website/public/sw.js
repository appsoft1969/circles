const SHELL_CACHE = "incircle-shell-v1";
const SHELL_ASSETS = [
  "/",
  "/manifest.json",
  "/icons/incircle.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== SHELL_CACHE)
          .map((cacheName) => caches.delete(cacheName)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/")),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkResponse = fetch(request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => cachedResponse);

      return cachedResponse || networkResponse;
    }),
  );
});

self.addEventListener("push", (event) => {
  const fallback = {
    title: "圈內提醒",
    body: "有新的圈內消息需要你看一下。",
    url: "/notifications",
  };

  let payload = fallback;
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { ...fallback, body: event.data.text() || fallback.body };
    }
  }
  const title = payload.title || fallback.title;
  const options = {
    body: payload.body || fallback.body,
    data: {
      url: payload.url || fallback.url,
      notificationId: payload.notificationId || null,
    },
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.tag || "incircle-notification",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/notifications", self.location.origin).href;
  const notificationId = event.notification.data?.notificationId;

  event.waitUntil(
    Promise.allSettled([
      notificationId
        ? fetch(`/api/notifications/${notificationId}/read`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          })
        : Promise.resolve(),
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
        const matchingClient = clients.find((client) => client.url === targetUrl);
        if (matchingClient) return matchingClient.focus();
        return self.clients.openWindow(targetUrl);
      }),
    ]),
  );
});
