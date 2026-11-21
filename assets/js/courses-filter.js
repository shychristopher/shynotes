(() => {
  const STORAGE_KEY = "shynotes.courses.filters.v1";

  const searchInput = document.getElementById("courseSearch");
  const onlyFeaturedEl = document.getElementById("onlyFeaturedSwitch");
  const hideDeprecatedEl = document.getElementById("hideDeprecatedSwitch");
  const tagCheckboxes = Array.from(document.querySelectorAll(".tag-checkbox"));
  const items = Array.from(document.querySelectorAll(".course-item"));

  const countEl = document.getElementById("courseCount");
  const emptyEl = document.getElementById("noCourseMatches");
  const badgeEl = document.getElementById("activeFilterBadge");
  const quickResetBtn = document.getElementById("quickResetBtn");
  const drawerResetBtn = document.getElementById("drawerResetBtn");
  const emptyResetBtn = document.getElementById("emptyResetBtn");
  const clearTagsBtn = document.getElementById("clearTagsBtn");

  if (!items.length) return;

  function readState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function writeState(state) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      // Ignore storage quota or private-mode errors
    }
  }

  function clearStoredState() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      // Ignore storage errors
    }
  }

  function applyFilters(shouldPersist = true) {
    const query = (searchInput?.value || "").trim().toLowerCase();
    const onlyFeatured = Boolean(onlyFeaturedEl?.checked);
    const hideDeprecated = Boolean(hideDeprecatedEl?.checked);
    const selectedTags = tagCheckboxes
      .filter((cb) => cb.checked)
      .map((cb) => cb.value);

    let visible = 0;

    items.forEach((item) => {
      const isFeatured = item.dataset.featured === "true";
      const isInactive = item.dataset.status === "inactive";
      const itemTags = (item.dataset.tags || "").split("|").filter(Boolean);
      const searchBlob = item.dataset.search || "";

      const matchesFeatured = !onlyFeatured || isFeatured;
      const matchesStatus = !hideDeprecated || !isInactive;
      const matchesTags =
        selectedTags.length === 0 ||
        selectedTags.some((tag) => itemTags.includes(tag));
      const matchesQuery = !query || searchBlob.includes(query);

      const show = matchesFeatured && matchesStatus && matchesTags && matchesQuery;
      item.classList.toggle("d-none", !show);
      if (show) visible += 1;
    });

    const activeCount =
      (onlyFeatured ? 1 : 0) +
      (hideDeprecated ? 1 : 0) +
      selectedTags.length;

    if (badgeEl) {
      badgeEl.textContent = String(activeCount);
      badgeEl.classList.toggle("d-none", activeCount === 0);
    }

    const hasAnyFilterOrQuery = activeCount > 0 || query.length > 0;
    quickResetBtn?.classList.toggle("d-none", !hasAnyFilterOrQuery);
    clearTagsBtn?.classList.toggle("d-none", selectedTags.length === 0);

    if (countEl) {
      countEl.textContent = `Showing ${visible} ${visible === 1 ? "course" : "courses"}`;
    }
    if (emptyEl) {
      emptyEl.classList.toggle("d-none", visible > 0);
    }

    if (shouldPersist) {
      writeState({
        query: searchInput?.value || "",
        onlyFeatured,
        hideDeprecated,
        tags: selectedTags
      });
    }
  }

  function restoreState() {
    const saved = readState();
    if (!saved) {
      applyFilters(false);
      return;
    }

    if (searchInput && typeof saved.query === "string") {
      searchInput.value = saved.query;
    }
    if (onlyFeaturedEl) {
      onlyFeaturedEl.checked = Boolean(saved.onlyFeatured);
    }
    if (hideDeprecatedEl) {
      hideDeprecatedEl.checked = Boolean(saved.hideDeprecated);
    }
    if (Array.isArray(saved.tags)) {
      const savedSet = new Set(saved.tags);
      tagCheckboxes.forEach((cb) => {
        cb.checked = savedSet.has(cb.value);
      });
    }

    applyFilters(false);
  }

  function resetAll() {
    if (searchInput) searchInput.value = "";
    if (onlyFeaturedEl) onlyFeaturedEl.checked = false;
    if (hideDeprecatedEl) hideDeprecatedEl.checked = false;
    tagCheckboxes.forEach((cb) => {
      cb.checked = false;
    });
    clearStoredState();
    applyFilters(false);
  }

  searchInput?.addEventListener("input", () => applyFilters(true));
  onlyFeaturedEl?.addEventListener("change", () => applyFilters(true));
  hideDeprecatedEl?.addEventListener("change", () => applyFilters(true));
  tagCheckboxes.forEach((cb) => cb.addEventListener("change", () => applyFilters(true)));

  clearTagsBtn?.addEventListener("click", () => {
    tagCheckboxes.forEach((cb) => {
      cb.checked = false;
    });
    applyFilters(true);
  });

  [quickResetBtn, drawerResetBtn, emptyResetBtn].forEach((btn) => {
    btn?.addEventListener("click", resetAll);
  });

  restoreState();
})();