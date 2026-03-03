/* eslint-disable no-restricted-globals */
// @ts-nocheck
// Service Worker for push notifications
// Plain JavaScript — not bundled by Vite

self.addEventListener("push", function (event) {
  if (!event.data) {
    return;
  }

  var payload;
  try {
    payload = event.data.json();
  } catch (e) {
    console.error("SW: Failed to parse push payload:", {
      error: e,
      raw: String(event.data.text()).slice(0, 200),
    });
    return;
  }

  var title = payload.title || "おはなしエンディングノート";
  var options = {
    body: payload.body || "",
    icon: "/icons/icon-192.svg",
    badge: "/icons/icon-192.svg",
    data: payload.data || {},
    tag: payload.tag || "default",
  };

  // Only show notification if app is not focused
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: false })
      .then(function (clientList) {
        var isFocused = clientList.some(function (client) {
          return client.visibilityState === "visible";
        });

        if (!isFocused) {
          return self.registration.showNotification(title, options);
        }
      }),
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  var urlToOpen = "/";
  if (
    event.notification.data &&
    typeof event.notification.data.url === "string"
  ) {
    urlToOpen = event.notification.data.url;
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        // Focus existing tab if available
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if ("focus" in client) {
            return client.focus();
          }
        }
        // Open new tab if no existing tab
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      }),
  );
});
