(() => {
  if (!("serviceWorker" in navigator)) return;

  const COURSE_CACHE_PREFIX = "shynotes-course-";
  const swUrl = document.querySelector('meta[name="shynotes-sw-url"]')?.content || "/sw.js";
  const offlineInfoEl = document.getElementById("displayOfflineStatus");
  const clearCacheBtn = document.getElementById("displayClearOfflineBtn");

  // Ask browser for persistent storage so localStorage & offline course caches aren't evicted
  if (navigator.storage && typeof navigator.storage.persist === "function") {
    navigator.storage.persist().catch(() => {});
  }

  function postToWorker(message) {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(message);
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.active?.postMessage(message))
      .catch(() => {});
  }

  function cacheCurrentCourseIfApplicable() {
    const sidebar = document.getElementById("courseNavSidebar");
    if (!sidebar) return;
    const slug = sidebar.dataset.courseSlug;
    if (!slug) return;

    const urls = Array.from(sidebar.querySelectorAll("[data-course-page][data-page-url]"))
      .map((el) => el.dataset.pageUrl)
      .filter(Boolean);

    if (!urls.length) return;
    postToWorker({ type: "CACHE_COURSE", slug, urls });
  }

  async function updateOfflineStatusUI() {
    if (!offlineInfoEl || !("caches" in window)) return;
    try {
      const keys = await window.caches.keys();
      const cachedSlugs = keys
        .filter((k) => k.startsWith(COURSE_CACHE_PREFIX))
        .map((k) => k.slice(COURSE_CACHE_PREFIX.length));

      if (!cachedSlugs.length) {
        offlineInfoEl.textContent = "Courses you open are cached automatically for offline study.";
        clearCacheBtn?.classList.add("d-none");
      } else {
        const label = cachedSlugs.map((s) => s.toUpperCase()).join(", ");
        offlineInfoEl.textContent = `Saved offline (${cachedSlugs.length}): ${label}`;
        clearCacheBtn?.classList.remove("d-none");
      }
    } catch (_) {
      // Ignore cache API errors
    }
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(swUrl)
      .then((reg) => {
        reg.update().catch(() => {});
        return navigator.serviceWorker.ready;
      })
      .then(() => {
        if (navigator.onLine) {
          cacheCurrentCourseIfApplicable();
        }
        window.setTimeout(updateOfflineStatusUI, 600);
      })
      .catch(() => {});
  });

  // Automatically refresh any cached courses when internet comes back
  window.addEventListener("online", () => {
    cacheCurrentCourseIfApplicable();
    postToWorker({ type: "REFRESH_CACHED_COURSES" });
  });

  clearCacheBtn?.addEventListener("click", async () => {
    if (!window.confirm("Clear downloaded offline copies of your courses? (Your progress, bookmarks, and display settings will NOT be erased.)")) {
      return;
    }
    postToWorker({ type: "CLEAR_COURSE_CACHES" });
    if ("caches" in window) {
      const keys = await window.caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith(COURSE_CACHE_PREFIX)).map((k) => window.caches.delete(k))
      );
    }
    updateOfflineStatusUI();
  });

  // Refresh offline course status whenever Display Settings modal opens
  document.getElementById("displaySettingsModal")?.addEventListener("show.bs.modal", updateOfflineStatusUI);
})();
