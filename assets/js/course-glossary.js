(() => {
  const root = document.getElementById("courseGlossary");
  if (!root) return;

  const courseSlug = root.dataset.courseSlug || "default";
  const STORAGE_KEY = `shynotes.glossary.state.v1.${courseSlug}`;
  const FILTER_TTL_MS = 30 * 60 * 1000; // Active search/categories auto-clear after 30 min of inactivity
  const RECENT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // Recent terms/searches expire after 7 days
  const MAX_RECENT_TERMS = 5;
  const MAX_RECENT_SEARCHES = 4;

  const controlsEl = document.getElementById("glossaryControls");
  const searchInput = document.getElementById("glossarySearch");
  const countEl = document.getElementById("glossaryCount");
  const resetBtn = document.getElementById("glossaryResetBtn");
  const sidebarResetBtn = document.getElementById("glossarySidebarResetBtn");
  const emptyResetBtn = document.getElementById("glossaryEmptyResetBtn");
  const clearCatsBtn = document.getElementById("glossaryClearCatsBtn");
  const filterCountEl = document.getElementById("glossaryFilterCount");
  const mobileFilterCountEl = document.getElementById("glossaryMobileFilterCount");
  const noMatchesEl = document.getElementById("glossaryNoMatches");
  const recentBarEl = document.getElementById("glossaryRecentBar");
  const recentListEl = document.getElementById("glossaryRecentList");
  const clearRecentBtn = document.getElementById("glossaryClearRecentBtn");

  const catCheckboxes = Array.from(document.querySelectorAll(".glossary-cat-checkbox"));
  const letterLinks = Array.from(root.querySelectorAll(".glossary-letter-link"));
  const letterGroups = Array.from(root.querySelectorAll(".glossary-letter-group"));
  const termCards = Array.from(root.querySelectorAll(".glossary-term-card"));
  const refLinks = Array.from(root.querySelectorAll(".glossary-ref-link"));

  const termLabelById = new Map();
  termCards.forEach((card) => {
    const id = card.dataset.termId;
    const heading = card.querySelector("h3");
    if (id && heading) {
      termLabelById.set(id, heading.textContent.trim());
    }
  });

  let expiryTimer = null;
  let searchRecordTimer = null;

  function readStorage() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function writeStorage(state) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      // Ignore storage errors
    }
  }

  function createEmptyState() {
    return {
      query: "",
      categories: [],
      filterUpdatedAt: null,
      recentUpdatedAt: null,
      recentTerms: [],
      recentSearches: []
    };
  }

  let state = readStorage() || createEmptyState();
  // Backward-compatible migration if older single `category` string was saved
  if (!Array.isArray(state.categories)) {
    state.categories =
      typeof state.category === "string" && state.category !== "all" ? [state.category] : [];
  }
  state.recentTerms = Array.isArray(state.recentTerms) ? state.recentTerms : [];
  state.recentSearches = Array.isArray(state.recentSearches) ? state.recentSearches : [];

  function getSelectedCategories() {
    return catCheckboxes.filter((cb) => cb.checked).map((cb) => cb.value);
  }

  function setSelectedCategories(categories) {
    const selectedSet = new Set(Array.isArray(categories) ? categories : []);
    catCheckboxes.forEach((cb) => {
      cb.checked = selectedSet.has(cb.value);
    });
  }

  function pruneExpiredState() {
    const now = Date.now();
    let changed = false;

    if (state.filterUpdatedAt && now - state.filterUpdatedAt > FILTER_TTL_MS) {
      if (state.query || state.categories.length > 0) {
        changed = true;
      }
      state.query = "";
      state.categories = [];
      state.filterUpdatedAt = null;
    }

    if (state.recentUpdatedAt && now - state.recentUpdatedAt > RECENT_TTL_MS) {
      if (state.recentTerms.length || state.recentSearches.length) {
        changed = true;
      }
      state.recentTerms = [];
      state.recentSearches = [];
      state.recentUpdatedAt = null;
    }

    if (changed) {
      writeStorage(state);
    }
    return changed;
  }

  function scheduleFilterExpiry() {
    if (expiryTimer !== null) {
      window.clearTimeout(expiryTimer);
      expiryTimer = null;
    }

    const hasActiveFilter = Boolean(state.query) || state.categories.length > 0;
    if (!hasActiveFilter || !state.filterUpdatedAt) return;

    const remaining = FILTER_TTL_MS - (Date.now() - state.filterUpdatedAt);
    if (remaining <= 0) {
      resetFilters();
      return;
    }

    expiryTimer = window.setTimeout(() => {
      if (pruneExpiredState()) {
        if (searchInput) searchInput.value = "";
        setSelectedCategories([]);
        applyGlossaryFilters(false);
      }
    }, remaining);
  }

  function persistFilterState() {
    const rawQuery = searchInput?.value || "";
    const selectedCategories = getSelectedCategories();
    const hasActiveFilter = rawQuery.trim().length > 0 || selectedCategories.length > 0;
    state.query = rawQuery;
    state.categories = selectedCategories;
    state.filterUpdatedAt = hasActiveFilter ? Date.now() : null;
    writeStorage(state);
    scheduleFilterExpiry();
  }

  function recordRecentTerm(termId) {
    if (!termLabelById.has(termId)) return;
    state.recentTerms = [termId, ...state.recentTerms.filter((id) => id !== termId)].slice(
      0,
      MAX_RECENT_TERMS
    );
    state.recentUpdatedAt = Date.now();
    writeStorage(state);
    renderRecentBar();
  }

  function recordRecentSearch(rawQuery) {
    const cleaned = (rawQuery || "").trim();
    if (cleaned.length < 2) return;
    const lowered = cleaned.toLowerCase();
    state.recentSearches = [
      cleaned,
      ...state.recentSearches.filter((q) => q.toLowerCase() !== lowered)
    ].slice(0, MAX_RECENT_SEARCHES);
    state.recentUpdatedAt = Date.now();
    writeStorage(state);
    renderRecentBar();
  }

  function renderRecentBar() {
    if (!recentBarEl || !recentListEl) return;

    const validTerms = state.recentTerms.filter((id) => termLabelById.has(id));
    const searches = state.recentSearches;
    const hasAny = validTerms.length > 0 || searches.length > 0;

    recentBarEl.classList.toggle("d-none", !hasAny);

    if (!hasAny) {
      recentListEl.innerHTML = "";
      return;
    }

    recentListEl.innerHTML = "";

    validTerms.forEach((termId) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "badge rounded-pill text-bg-primary-subtle text-primary-emphasis border border-primary-subtle fw-normal";
      btn.style.cursor = "pointer";
      btn.textContent = termLabelById.get(termId);
      btn.title = `Jump to ${termLabelById.get(termId)}`;
      btn.addEventListener("click", () => {
        window.history.replaceState(null, "", `#term-${termId}`);
        jumpToTerm(termId);
      });
      recentListEl.appendChild(btn);
    });

    searches.forEach((queryText) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "badge rounded-pill bg-body text-body border fw-normal";
      btn.style.cursor = "pointer";
      btn.textContent = `“${queryText}”`;
      btn.title = `Search for "${queryText}"`;
      btn.addEventListener("click", () => {
        if (searchInput) {
          searchInput.value = queryText;
          applyGlossaryFilters(true);
        }
      });
      recentListEl.appendChild(btn);
    });
  }

  function applyGlossaryFilters(shouldPersist = true) {
    const query = (searchInput?.value || "").trim().toLowerCase();
    const selectedCategories = getSelectedCategories();
    let totalVisible = 0;
    const visibleLetters = new Set();

    letterGroups.forEach((group) => {
      const cards = Array.from(group.querySelectorAll(".glossary-term-card"));
      let groupVisible = 0;

      cards.forEach((card) => {
        const cardCat = card.dataset.category || "";
        const searchBlob = card.dataset.search || "";

        const matchesCategory =
          selectedCategories.length === 0 || selectedCategories.includes(cardCat);
        const matchesQuery = !query || searchBlob.includes(query);
        const show = matchesCategory && matchesQuery;

        card.classList.toggle("d-none", !show);
        if (show) {
          groupVisible += 1;
          totalVisible += 1;
        }
      });

      group.classList.toggle("d-none", groupVisible === 0);
      if (groupVisible > 0) {
        visibleLetters.add(group.dataset.letter);
      }
    });

    letterLinks.forEach((link) => {
      const hasMatches = visibleLetters.has(link.dataset.letter);
      link.classList.toggle("disabled", !hasMatches);
      link.classList.toggle("opacity-50", !hasMatches);
      link.setAttribute("aria-disabled", hasMatches ? "false" : "true");
    });

    if (countEl) {
      countEl.textContent = `${totalVisible} ${totalVisible === 1 ? "term" : "terms"}`;
    }

    const catCount = selectedCategories.length;
    const hasAnyFilter = query.length > 0 || catCount > 0;

    [filterCountEl, mobileFilterCountEl].forEach((badge) => {
      if (!badge) return;
      badge.textContent = String(catCount);
      badge.classList.toggle("d-none", catCount === 0);
    });

    clearCatsBtn?.classList.toggle("d-none", catCount === 0);
    sidebarResetBtn?.classList.toggle("d-none", !hasAnyFilter);
    resetBtn?.classList.toggle("d-none", !hasAnyFilter);
    noMatchesEl?.classList.toggle("d-none", totalVisible > 0);

    if (shouldPersist) {
      persistFilterState();
    }
  }

  function resetFilters() {
    if (searchInput) searchInput.value = "";
    setSelectedCategories([]);
    applyGlossaryFilters(true);
  }

  function highlightCard(card) {
    if (!card) return;
    termCards.forEach((c) => c.classList.remove("glossary-highlight"));
    card.classList.add("glossary-highlight");
    window.setTimeout(() => {
      card.classList.remove("glossary-highlight");
    }, 1800);
  }

  function jumpToTerm(termId) {
    const targetCard = document.getElementById(`term-${termId}`);
    if (!targetCard) return;

    if (targetCard.classList.contains("d-none")) {
      resetFilters();
    }

    recordRecentTerm(termId);
    targetCard.scrollIntoView({ behavior: "smooth", block: "start" });
    highlightCard(targetCard);
  }

  function scheduleSearchHistoryRecord() {
    if (searchRecordTimer !== null) {
      window.clearTimeout(searchRecordTimer);
    }
    searchRecordTimer = window.setTimeout(() => {
      recordRecentSearch(searchInput?.value || "");
    }, 1200);
  }

  searchInput?.addEventListener("input", () => {
    applyGlossaryFilters(true);
    scheduleSearchHistoryRecord();
  });

  searchInput?.addEventListener("search", () => {
    applyGlossaryFilters(true);
    recordRecentSearch(searchInput.value);
  });

  searchInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      if (searchRecordTimer !== null) window.clearTimeout(searchRecordTimer);
      recordRecentSearch(searchInput.value);
    }
  });

  catCheckboxes.forEach((cb) => {
    cb.addEventListener("change", () => applyGlossaryFilters(true));
  });

  clearCatsBtn?.addEventListener("click", () => {
    setSelectedCategories([]);
    applyGlossaryFilters(true);
  });

  [resetBtn, sidebarResetBtn, emptyResetBtn].forEach((btn) => {
    btn?.addEventListener("click", resetFilters);
  });

  clearRecentBtn?.addEventListener("click", () => {
    state.recentTerms = [];
    state.recentSearches = [];
    state.recentUpdatedAt = null;
    writeStorage(state);
    renderRecentBar();
  });

  refLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const targetId = link.dataset.targetTerm;
      if (!targetId) return;
      event.preventDefault();
      window.history.replaceState(null, "", `#term-${targetId}`);
      jumpToTerm(targetId);
    });
  });

  termCards.forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("a, button")) return;
      const termId = card.dataset.termId;
      if (termId) recordRecentTerm(termId);
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && pruneExpiredState()) {
      if (searchInput) searchInput.value = "";
      setSelectedCategories([]);
      applyGlossaryFilters(false);
      renderRecentBar();
    }
  });

  function updateStickyOffset() {
    if (!controlsEl) return;
    const navbar = document.querySelector(".navbar.sticky-top");
    const navHeight = navbar ? navbar.getBoundingClientRect().height : 57;
    const controlsHeight = controlsEl.getBoundingClientRect().height;
    root.style.setProperty("--glossary-sticky-top", `${Math.ceil(navHeight + controlsHeight)}px`);
  }

  if (controlsEl && "ResizeObserver" in window) {
    const ro = new window.ResizeObserver(updateStickyOffset);
    ro.observe(controlsEl);
  }
  window.addEventListener("resize", updateStickyOffset);

  // Initialize from stored per-course glossary state
  pruneExpiredState();
  if (searchInput && typeof state.query === "string") {
    searchInput.value = state.query;
  }
  setSelectedCategories(state.categories);
  applyGlossaryFilters(false);
  renderRecentBar();
  updateStickyOffset();
  scheduleFilterExpiry();

  if (window.location.hash && window.location.hash.startsWith("#term-")) {
    const initialId = window.location.hash.slice("#term-".length);
    window.requestAnimationFrame(() => jumpToTerm(initialId));
  }
})();
