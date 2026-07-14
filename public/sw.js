// Intentionally caches nothing. Its only jobs: exist so engines treat the app
// as installable, and provide a future Web-Push hook. Do NOT add a 'fetch'
// handler with caching without deliberately excluding /api/ and auth routes
// (would serve stale session/auth state).
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
// No 'fetch' listener — all requests pass straight through to the network.
