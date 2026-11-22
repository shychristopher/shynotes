(() => {
  const STORAGE_KEY = "shynotes.courses.filters.v1";

  const searchInput = document.getElementById("courseSearch");
  const featuredOnlyEl = document.getElementById("filterFeaturedOnly");
  const hideDeprecatedEl = document.getElementById("filterHideDeprecated");
  const tagQuickFilterEl = document.getElementById("tagQuickFilter");
  const tagOptions = Array.from(document.querySelectorAll(".course-tag-option"));
  const tagCheckboxes = Array.from(document.querySelectorAll(".course-tag-checkbox"));
  const noTagMatchesEl = document.getElementById("noTagMatches");
  const clearTagsBtn = document.getElementById("clearTagFilters");
  const items = Array.from(document.querySelectorAll(".course-card-item"));

  const resultCountEl = document.getElementById("courseResultCount");
  const activeCountEl = document.getElementById("activeFilterCount");
  const emptyMatchesEl = document.getElementById("noCourseMatches");
  const resetBtn = document.getElementById("resetCourseFilters");
  const quickResetBtn = document.getElementById("quickResetCourseFilters");
  const emptyResetBtn = document.getElementById("emptyResetCourseFilters");

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
      // Ignore storage errors (private mode / quota)
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
    const rawQuery = searchInput?.value || "";
    const query = rawQuery.trim().toLowerCase();
    const featuredOnly = Boolean(featuredOnlyEl?.checked);
    const hideDeprecated = Boolean(hideDeprecatedEl?.checked);
    const selectedTags = tagCheckboxes
      .filter((cb) => cb.checked)
      .map((cb) => cb.value);

    let visible = 0;

    items.forEach((item) => {
      const isFeatured = item.dataset.featured === "true";
      const isDeprecated = item.dataset.deprecated === "true";
      const itemTags = (item.dataset.tags || "").split("|").filter(Boolean);
      const searchBlob = item.dataset.search || "";

      const matchesFeatured = !featuredOnly || isFeatured;
      const matchesDeprecated = !hideDeprecated || !isDeprecated;
      const matchesTags =
        selectedTags.length === 0 ||
        selectedTags.some((tag) => itemTags.includes(tag));
      const matchesQuery = !query || searchBlob.includes(query);

      const show = matchesFeatured && matchesDeprecated && matchesTags && matchesQuery;
      item.classList.toggle("d-none", !show);
      if (show) visible += 1;
    });

    const activeFilterCount =
      (featuredOnly ? 1 : 0) +
      (hideDeprecated ? 1 : 0) +
      selectedTags.length;

    if (activeCountEl) {
      activeCountEl.textContent = String(activeFilterCount);
      activeCountEl.classList.toggle("d-none", activeFilterCount === 0);
    }

    const hasAnyFilter = activeFilterCount > 0 || query.length > 0;
    resetBtn?.classList.toggle("d-none", activeFilterCount === 0);
    quickResetBtn?.classList.toggle("d-none", !hasAnyFilter);
    clearTagsBtn?.classList.toggle("d-none", selectedTags.length === 0);

    if (resultCountEl) {
      resultCountEl.textContent = `Showing ${visible} ${visible === 1 ? "course" : "courses"}`;
    }

    if (emptyMatchesEl && items.length > 0) {
      emptyMatchesEl.classList.toggle("d-none", visible > 0);
    }

    if (shouldPersist) {
      if (hasAnyFilter) {
        writeState({
          query: rawQuery,
          featuredOnly,
          hideDeprecated,
          tags: selectedTags
        });
      } else {
        clearStoredState();
      }
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
    if (featuredOnlyEl) {
      featuredOnlyEl.checked = Boolean(saved.featuredOnly);
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

  function filterTagList() {
    const tagQuery = (tagQuickFilterEl?.value || "").trim().toLowerCase();
    let visibleTags = 0;

    tagOptions.forEach((option) => {
      const label = option.dataset.tagLabel || "";
      const matches = !tagQuery || label.includes(tagQuery);
      option.classList.toggle("d-none", !matches);
      if (matches) visibleTags += 1;
    });

    noTagMatchesEl?.classList.toggle("d-none", visibleTags > 0);
  }

  function resetAll() {
    if (searchInput) searchInput.value = "";
    if (featuredOnlyEl) featuredOnlyEl.checked = false;
    if (hideDeprecatedEl) hideDeprecatedEl.checked = false;
    if (tagQuickFilterEl) {
      tagQuickFilterEl.value = "";
      filterTagList();
    }
    tagCheckboxes.forEach((cb) => {
      cb.checked = false;
    });
    clearStoredState();
    applyFilters(false);
  }

  searchInput?.addEventListener("input", () => applyFilters(true));
  searchInput?.addEventListener("search", () => applyFilters(true));
  featuredOnlyEl?.addEventListener("change", () => applyFilters(true));
  hideDeprecatedEl?.addEventListener("change", () => applyFilters(true));
  tagQuickFilterEl?.addEventListener("input", filterTagList);
  tagQuickFilterEl?.addEventListener("search", filterTagList);
  tagCheckboxes.forEach((cb) => cb.addEventListener("change", () => applyFilters(true)));

  clearTagsBtn?.addEventListener("click", () => {
    tagCheckboxes.forEach((cb) => {
      cb.checked = false;
    });
    applyFilters(true);
  });

  [resetBtn, quickResetBtn, emptyResetBtn].forEach((btn) => {
    btn?.addEventListener("click", resetAll);
  });

  restoreState();
})();
