// Basic app-shell caching only — NOT full offline scan functionality (that's
// a much bigger scope: it'd need the Meshy pipeline, camera, and Supabase
// writes to all work offline, which they fundamentally can't). This just
// lets the shell HTML respond from cache if the network is briefly down, so
// re-opening the installed app doesn't show a bare browser error page.
//
// Deliberately does NOT try to cache Vite's hashed JS/CSS bundle filenames —
// those change every build and hand-maintaining a list here would go stale
// immediately without build-tool integration. Only the navigation shell
// (index.html) and a couple of static, never-hashed public assets are cached.

const CACHE_NAME = 'tulasi-shell-v1'
const SHELL_URLS = ['/', '/manifest.webmanifest', '/favicon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

// Network-first for navigations (so a signed-in user always sees the latest
// build when online), falling back to the cached shell only when the
// network request fails outright.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(
    fetch(event.request).catch(() => caches.match('/').then((cached) => cached ?? Response.error())),
  )
})
