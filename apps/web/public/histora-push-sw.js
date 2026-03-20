self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  const payload = event.data.json();
  event.waitUntil(
    self.registration.showNotification(payload.title || "Histora", {
      body: payload.body || "A sign-in alert is waiting for you.",
      tag: payload.tag || "histora-alert",
      data: payload.data || {},
      icon: "/favicon.ico",
      badge: "/favicon.ico"
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const requestedPath = event.notification.data?.url;
  const targetPath = typeof requestedPath === "string" && requestedPath.startsWith("/") ? requestedPath : "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetPath);
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetPath);
      }

      return undefined;
    })
  );
});
