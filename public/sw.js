/* Affiche les payloads title/body/url/tag envoyés par l'Edge Function push-dispatcher. */
self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }

  const rawPath = typeof payload.url === "string" ? payload.url : "/notifications";
  let url = "/notifications";
  try {
    const parsed = new URL(rawPath, self.location.origin);
    if (parsed.origin === self.location.origin) url = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch { /* Garde la route interne par défaut. */ }

  const title = typeof payload.title === "string" && payload.title ? payload.title : "Kladriva Post";
  const body = typeof payload.body === "string" ? payload.body : "Tu as reçu un nouveau message.";
  const tag = typeof payload.tag === "string" && payload.tag ? payload.tag : "kladriva-message";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag,
    data: { url },
    renotify: false,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || "/notifications", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) return existing.navigate(destination).then(() => existing.focus());
    return self.clients.openWindow(destination);
  }));
});
