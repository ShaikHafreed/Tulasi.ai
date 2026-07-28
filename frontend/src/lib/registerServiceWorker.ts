// Basic app-shell service worker (see public/sw.js) — registered after load
// so it never competes with the initial page's own network requests.
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Installability/offline-shell is a nice-to-have, not load-bearing —
      // a registration failure (e.g. dev server quirks) shouldn't be user-visible.
    })
  })
}
