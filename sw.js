---
layout: null
---
const BUILD_VERSION = "{{ site.time | date: '%Y%m%d%H%M%S' }}";
const CORE_CACHE = `shynotes-core-${BUILD_VERSION}`;
const RUNTIME_CACHE = "shynotes-runtime-v1";
const COURSE_CACHE_PREFIX = "shynotes-course-";
const OFFLINE_URL = {{ '/offline.html' | relative_url | jsonify }};

const CORE_ASSETS = [
  {{ '/' | relative_url | jsonify }},
  {{ '/courses/' | relative_url | jsonify }},
  OFFLINE_URL,
  {{ '/manifest.webmanifest' | relative_url | jsonify }},
  {{ '/assets/images/logo.jpg' | relative_url | jsonify }},
  {{ '/assets/images/icon-192.png' | relative_url | jsonify }},
  {{ '/assets/images/icon-512.png' | relative_url | jsonify }},
  {{ '/assets/images/apple-touch-icon.png' | relative_url | jsonify }},
  {{ '/assets/js/display-settings.js' | relative_url | jsonify }},
  {{ '/assets/js/cloud-sync.js' | relative_url | jsonify }},
  {{ '/assets/js/courses-dashboard.js' | relative_url | jsonify }},
  {{ '/assets/js/course-progress.js' | relative_url | jsonify }},
  {{ '/assets/js/course-sections.js' | relative_url | jsonify }},
  {{ '/assets/js/course-glossary.js' | relative_url | jsonify }},
  {{ '/assets/js/course-glossary-lookup.js' | relative_url | jsonify }},
  {{ '/assets/js/course-quick-reference.js' | relative_url | jsonify }},
  {{ '/assets/js/course-mindmap.js' | relative_url | jsonify }},
  {{ '/assets/js/course-content-print.js' | relative_url | jsonify }},
  {{ '/assets/js/pwa.js' | relative_url | jsonify }},
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"
];

function extractCourseSlug(urlStr) {
  try {
    const pathname = new URL(urlStr, self.location.origin).pathname;
    const match = pathname.match(/\/courses\/([^/]+)\//);
    return match ? match[1].toLowerCase() : null;
  } catch (_) {
    return null;
  }
}

function canonicalizeUrl(urlStr) {
  const u = new URL(urlStr, self.location.origin);
  u.hash = "";
  u.search = "";
  return u.href;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CORE_CACHE)
      .then((cache) =>
        Promise.allSettled(
          CORE_ASSETS.map((url) =>
            fetch(url, { cache: "no-cache" }).then((res) => {
              if (res && (res.ok || res.type === "opaque")) {
                return cache.put(url, res);
              }
            })
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("shynotes-core-") && k !== CORE_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function fetchWithTimeout(request, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function cacheCourseUrls(slug, urls) {
  if (!slug || !Array.isArray(urls) || !urls.length) return;
  const cacheName = `${COURSE_CACHE_PREFIX}${slug}`;
  const cache = await caches.open(cacheName);
  const uniqueUrls = Array.from(new Set(urls.map(canonicalizeUrl)));

  // Fetch gently in small batches so we never saturate mobile bandwidth
  const batchSize = 4;
  for (let i = 0; i < uniqueUrls.length; i += batchSize) {
    const batch = uniqueUrls.slice(i, i + batchSize);
    await Promise.allSettled(
      batch.map(async (href) => {
        try {
          const res = await fetch(href, { cache: "no-cache", credentials: "same-origin" });
          if (res && res.ok) {
            await cache.put(href, res);
          }
        } catch (_) {
          // Offline or transient failure — keep existing cached copy intact
        }
      })
    );
  }
}

async function refreshAllCachedCourses() {
  const keys = await caches.keys();
  const courseCaches = keys.filter((k) => k.startsWith(COURSE_CACHE_PREFIX));
  for (const cacheName of courseCaches) {
    const cache = await caches.open(cacheName);
    const reqs = await cache.keys();
    const urls = reqs.map((r) => r.url);
    const slug = cacheName.slice(COURSE_CACHE_PREFIX.length);
    await cacheCourseUrls(slug, urls);
  }
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "CACHE_COURSE" && data.slug && Array.isArray(data.urls)) {
    event.waitUntil(cacheCourseUrls(String(data.slug).toLowerCase(), data.urls));
  } else if (data.type === "REFRESH_CACHED_COURSES") {
    event.waitUntil(refreshAllCachedCourses());
  } else if (data.type === "CLEAR_COURSE_CACHES") {
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys.filter((k) => k.startsWith(COURSE_CACHE_PREFIX)).map((k) => caches.delete(k))
          )
        )
    );
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  const isSameOrigin = url.origin === self.location.origin;
  const isNavigation =
    request.mode === "navigate" ||
    (request.headers.get("accept") || "").includes("text/html");

  // 1. HTML pages: Network-first (always fresh when online), selective cache fallback offline
  if (isSameOrigin && isNavigation) {
    event.respondWith(
      (async () => {
        const cleanHref = canonicalizeUrl(request.url);
        const courseSlug = extractCourseSlug(cleanHref);
        const targetCacheName = courseSlug ? `${COURSE_CACHE_PREFIX}${courseSlug}` : CORE_CACHE;

        try {
          const networkRes = await fetchWithTimeout(request, 4500);
          if (networkRes && networkRes.ok) {
            const cache = await caches.open(targetCacheName);
            cache.put(cleanHref, networkRes.clone());
          }
          return networkRes;
        } catch (_) {
          // Offline or timed out: look up canonical URL (so ?view=glossary, ?view=quick-reference, ?print=1 all work!)
          const cachedExact = await caches.match(cleanHref);
          if (cachedExact) return cachedExact;
          const cachedIgnoreSearch = await caches.match(request, { ignoreSearch: true });
          if (cachedIgnoreSearch) return cachedIgnoreSearch;
          const offlineFallback = await caches.match(OFFLINE_URL);
          if (offlineFallback) return offlineFallback;
          return new Response("Offline — this page has not been cached yet.", {
            status: 503,
            headers: { "Content-Type": "text/plain" }
          });
        }
      })()
    );
    return;
  }

  // 2. Same-origin course page fetches (e.g. Print Preview compiling sibling topics or Quick Reference preview)
  if (isSameOrigin && extractCourseSlug(request.url)) {
    event.respondWith(
      (async () => {
        const cleanHref = canonicalizeUrl(request.url);
        const slug = extractCourseSlug(cleanHref);
        const cacheName = `${COURSE_CACHE_PREFIX}${slug}`;
        try {
          const networkRes = await fetchWithTimeout(request, 4500);
          if (networkRes && networkRes.ok) {
            const cache = await caches.open(cacheName);
            cache.put(cleanHref, networkRes.clone());
          }
          return networkRes;
        } catch (_) {
          const cached = await caches.match(cleanHref);
          if (cached) return cached;
          return new Response("Offline", { status: 503 });
        }
      })()
    );
    return;
  }

  // 3. Static assets, CDN Bootstrap & Webfonts (OpenDyslexic, Atkinson, Lexend): Stale-While-Revalidate
  const isCacheableExternal =
    url.hostname.includes("cdn.jsdelivr.net") ||
    url.hostname.includes("fonts.googleapis.com") ||
    url.hostname.includes("fonts.gstatic.com") ||
    url.hostname.includes("fonts.cdnfonts.com");

  if (isSameOrigin || isCacheableExternal) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        const networkPromise = fetch(request)
          .then(async (res) => {
            if (res && (res.ok || res.type === "opaque")) {
              const cache = await caches.open(isSameOrigin ? CORE_CACHE : RUNTIME_CACHE);
              cache.put(request, res.clone());
            }
            return res;
          })
          .catch(() => null);

        if (cached) {
          event.waitUntil(networkPromise);
          return cached;
        }
        const net = await networkPromise;
        return net || new Response("", { status: 504 });
      })()
    );
  }
});
