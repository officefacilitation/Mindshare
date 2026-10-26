// Mindshare Background Service Worker & Push Notification Dispatcher

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle Background Push Event
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: 'Mindshare Reminder', body: event.data.text() };
    }
  }

  const title = data.title || 'Mindshare Reminder';
  const options = {
    body: data.body || 'You have a scheduled thought reminder.',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: data.tag || 'mindshare-reminder',
    renotify: true,
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/',
      noteId: data.noteId || null,
    },
    actions: [
      { action: 'open', title: 'Open Thought' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Handle Notification Click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing tab if open
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Otherwise open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
