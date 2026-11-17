/*
 * Sillage hors ligne. Quand le Mac de Bastien est éteint, l'appareil affiche les
 * pages gardées lors de la dernière visite (lecture seule) ; le coach attend.
 *
 * - Pages : réseau d'abord ; en cas d'échec (pas de réseau, délai dépassé, relais du
 *   tunnel en 502/503/504), la dernière version gardée sur l'appareil.
 * - Ressources du build (/_next/static, icônes) : cache d'abord (noms versionnés).
 * - /api : jamais mis en cache.
 * - Préparation : la page envoie { type: "warm", urls } et le service worker garde
 *   ces pages et leurs ressources. { type: "clear" } efface tout (déconnexion).
 * - Une page qui renvoie vers /connexion (session révoquée) efface tout.
 */
const PAGES = "sillage-pages-v1";
const ASSETS = "sillage-assets-v1";
const OFFLINE_PAGE = "/offline.html";
const TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(ASSETS).then((cache) => cache.add(OFFLINE_PAGE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== PAGES && key !== ASSETS).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/icon.svg" || url.pathname.startsWith("/apple-icon") || url.pathname === "/manifest.webmanifest";
}

function pageKey(url) {
  return new URL(url.pathname, self.location.origin).href;
}

function withTimeout(promise) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

async function clearPages() {
  await caches.delete(PAGES);
}

async function keepPage(url, response) {
  if (!response.ok || response.redirected || url.pathname.startsWith("/connexion")) return;
  const cache = await caches.open(PAGES);
  await cache.put(pageKey(url), response);
}

async function page(request) {
  const url = new URL(request.url);
  try {
    const response = await withTimeout(fetch(request));
    if (response.status >= 502) throw new Error(`relais ${response.status}`);
    if (response.redirected && new URL(response.url).pathname.startsWith("/connexion")) {
      await clearPages();
      return response;
    }
    await keepPage(url, response.clone());
    return response;
  } catch {
    const cached = await caches.match(pageKey(url), { cacheName: PAGES });
    return cached ?? (await caches.match(OFFLINE_PAGE)) ?? Response.error();
  }
}

async function asset(request) {
  const cached = await caches.match(request, { cacheName: ASSETS });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(ASSETS);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (isAsset(url)) {
    event.respondWith(asset(request));
    return;
  }
  // Navigation complète : réseau d'abord, copie gardée sur l'appareil.
  if (request.mode === "navigate") event.respondWith(page(request));
  // Navigations internes (RSC) : laissées au réseau ; hors ligne, Next repasse par une navigation complète.
});

const ASSET_PATTERN = /(?:href|src)="(\/_next\/static\/[^"]+)"/g;

async function warm(urls) {
  const pages = await caches.open(PAGES);
  const assets = await caches.open(ASSETS);
  let kept = 0;
  for (const path of urls) {
    try {
      const url = new URL(path, self.location.origin);
      const response = await fetch(url, { credentials: "same-origin", headers: { "x-sillage-warm": "1" } });
      if (response.redirected && new URL(response.url).pathname.startsWith("/connexion")) {
        await clearPages();
        return kept;
      }
      if (!response.ok || response.redirected) continue;
      const html = await response.clone().text();
      await pages.put(pageKey(url), response);
      kept += 1;
      for (const match of html.matchAll(ASSET_PATTERN)) {
        const assetUrl = new URL(match[1].replace(/&amp;/g, "&"), self.location.origin);
        if (!(await assets.match(assetUrl))) {
          const assetResponse = await fetch(assetUrl).catch(() => null);
          if (assetResponse && assetResponse.ok) await assets.put(assetUrl, assetResponse);
        }
      }
    } catch {
      // Page suivante : la préparation est un bonus, jamais bloquante.
    }
  }
  return kept;
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "warm" && Array.isArray(data.urls)) {
    event.waitUntil(warm(data.urls.filter((url) => typeof url === "string" && url.startsWith("/"))).then((kept) => event.source && event.source.postMessage({ type: "warmed", kept })));
  }
  if (data.type === "clear") event.waitUntil(clearPages());
});
