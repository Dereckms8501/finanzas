// Guarda en caché SOLO los archivos de la app. Datos (.enc, .json de datos) y api.github.com van siempre por red.
// Cada vez que se publique un cambio, subir VERSION para que los teléfonos bajen la versión nueva.
const VERSION = 'finanzas-v6';
const ARCHIVOS = [
  './', './index.html', './css/app.css', './manifest.json',
  './js/app.js', './js/cripto.js', './js/datos.js', './js/graficos.js', './js/iconos.js', './js/sync.js',
  './iconos/icono-192.png', './iconos/icono-512.png', './iconos/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS.map(u => new Request(u, { cache: 'reload' })))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  const esApp = e.request.method === 'GET' && u.origin === location.origin
    && ARCHIVOS.some(a => new URL(a, self.registration.scope).pathname === u.pathname);
  if (!esApp) return; // todo lo demás va directo a la red, sin caché
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
