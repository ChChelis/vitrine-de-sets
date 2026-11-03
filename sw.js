// Service worker: shell em cache (offline), imagens do Scryfall em cache, aviso de nova versão.
// BUILD é trocado pelo hash do commit no deploy (.github/workflows/pages.yml). Cada valor novo = cache novo.
const BUILD = 'dev';
const SHELL = 'shell-' + BUILD;
const IMGS = 'imgs-v1';          // imagens de cartas: persistem entre versões do app
const FONTS = 'fonts-v1';
const MAX_IMGS = 4000;

const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/store.js', 'js/scryfall.js', 'js/catalog.js', 'js/backup.js', 'js/lands.js', 'js/report.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
];

self.addEventListener('install', e => {
  // sem skipWaiting automático: o app mostra "nova versão" e o usuário decide
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) { e.respondWith(shell(req)); return; }
  if (url.hostname === 'cards.scryfall.io' || url.hostname === 'svgs.scryfall.io') { e.respondWith(image(req)); return; }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') { e.respondWith(swr(req, FONTS)); return; }
  // api.scryfall.com: sempre rede (dados frescos), sem cache aqui; o app guarda as cartas no IndexedDB
});

async function shell(req) {
  const c = await caches.open(SHELL);
  const hit = await c.match(req, { ignoreSearch: true });
  if (hit && BUILD !== 'dev') return hit;    // em desenvolvimento, rede primeiro (cache só como reserva offline)
  try {
    const r = await fetch(req);
    if (r.ok) c.put(req, r.clone());
    return r;
  } catch {
    if (hit) return hit;
    if (req.mode === 'navigate') return (await c.match('index.html')) || Response.error();
    return Response.error();
  }
}

// Imagens: cache primeiro. Refaz a requisição em modo CORS (resposta legível, sem o custo de cota das opacas)
// e serve a mesma resposta a <img> comum e a <img crossorigin> (usada no PDF).
async function image(req) {
  const c = await caches.open(IMGS);
  const hit = await c.match(req.url, { ignoreVary: true });
  if (hit) return hit;
  try {
    const r = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
    if (r.ok) { c.put(req.url, r.clone()); trim(c); }
    return r;
  } catch { return Response.error(); }
}

let trimming = false;
async function trim(c) {
  if (trimming) return; trimming = true;
  try { const ks = await c.keys(); for (let i = 0; i < ks.length - MAX_IMGS; i++) await c.delete(ks[i]); }
  finally { trimming = false; }
}

async function swr(req, name) {
  const c = await caches.open(name);
  const hit = await c.match(req);
  const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => null);
  return hit || (await net) || Response.error();
}
