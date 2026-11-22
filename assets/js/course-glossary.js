(() => {
  const root = document.getElementById("courseGlossary");
  if (!root) return;

  const courseSlug = root.dataset.courseSlug || "default";
  const STORAGE_KEY = `shynotes.glossary.state.v1.${courseSlug}`;
  const FILTER_TTL_MS = 30 * 60 * 1000; // Active search/category auto-clears after 30 min of inactivity
  const RECENT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // Recent terms/searches expire after 7 days
  const MAX_RECENT_TERMS = 5;
  const MAX_RECENT_SEARCHES = 4;

  const controlsEl = document.getElementById("glossaryControls");
  const searchInput = document.getElementById("glossarySearch");
  const countEl = document.getElementById("glossaryCount");
  const resetBtn = document.getElementById("glossaryResetBtn");
  const emptyResetBtn = document.getElementById("glossaryEmptyResetBtn");
  const noMatchesEl = document.getElementById("glossaryNoMatches");
  const recentBarEl = document.getElementById("glossaryRecentBar");
  const recentListEl = document.getElementById("glossaryRecentList");
  const clearRecentBtn = document.getElementById("glossaryClearRecentBtn");
  const catButtons = Array.from(root.querySelectorAll(".glossary-cat-btn"));
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

  let activeCategory = "all";
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
      category: "all",
      filterUpdatedAt: null,
      recentUpdatedAt: null,
      recentTerms: [],
      recentSearches: []
    };
  }

  let state = readStorage() || createEmptyState();
  state.recentTerms = Array.isArray(state.recentTerms) ? state.recentTerms : [];
  state.recentSearches = Array.isArray(state.recentSearches) ? state.recentSearches : [];

  function pruneExpiredState() {
    const now = Date.now();
    let changed = false;

    if (state.filterUpdatedAt && now - state.filterUpdatedAt > FILTER_TTL_MS) {
      if (state.query || (state.category && state.category !== "all")) {
        changed = true;
      }
      state.query = "";
      state.category = "all";
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

    const hasActiveFilter = Boolean(state.query) || (state.category && state.category !== "all");
    if (!hasActiveFilter || !state.filterUpdatedAt) return;

    const remaining = FILTER_TTL_MS - (Date.now() - state.filterUpdatedAt);
    if (remaining <= 0) {
      resetFilters();
      return;
    }

    expiryTimer = window.setTimeout(() => {
      if (pruneExpiredState()) {
        if (searchInput) searchInput.value = "";
        setActiveCategory("all", false);
      }
    }, remaining);
  }

  function persistFilterState() {
    const rawQuery = searchInput?.value || "";
    const hasActiveFilter = rawQuery.trim().length > 0 || activeCategory !== "all";
    state.query = rawQuery;
    state.category = activeCategory;
    state.filterUpdatedAt = hasActiveFilter ? Date.now() : null;
    writeStorage(state);
    scheduleFilterExpiry();
  }

  function recordRecentTerm(termId) {
    if (!termLabelById.has(termId)) return;
    state.recentTerms = [termId, ...state.recentTerms.filter((id) => id !== termId)].slice(0, MAX_RECENT_TERMS);
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
    recentBarEl.classList.toggle("d-flex", hasAny);

    if (!hasAny) {
      recentListEl.innerHTML = "";
      return;
    }

    recentListEl.innerHTML = "";

    validTerms.forEach((termId) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "badge rounded-pill text-bg-primary-subtle text-primary-emphasis border border-primary-subtle fw-normal";
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
      btn.className = "badge rounded-pill bg-body-tertiary text-body border fw-normal";
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
    let totalVisible = 0;
    const visibleLetters = new Set();

    letterGroups.forEach((group) => {
      const cards = Array.from(group.querySelectorAll(".glossary-term-card"));
      let groupVisible = 0;

      cards.forEach((card) => {
        const cardCat = card.dataset.category || "";
        const searchBlob = card.dataset.search || "";

        const matchesCategory = activeCategory === "all" || cardCat === activeCategory;
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

    const hasActiveFilter = query.length > 0 || activeCategory !== "all";
    resetBtn?.classList.toggle("d-none", !hasActiveFilter);
    noMatchesEl?.classList.toggle("d-none", totalVisible > 0);

    if (shouldPersist) {
      persistFilterState();
    }
  }

  function setActiveCategory(category, shouldPersist = true) {
    const valid = catButtons.some((btn) => btn.dataset.category === category);
    activeCategory = valid ? category : "all";
    catButtons.forEach((btn) => {
      const isSelected = btn.dataset.category === activeCategory;
      btn.classList.toggle("btn-primary", isSelected);
      btn.classList.toggle("btn-outline-secondary", !isSelected);
      btn.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
    applyGlossaryFilters(shouldPersist);
  }

  function resetFilters() {
    if (searchInput) searchInput.value = "";
    setActiveCategory("all", true);
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

  catButtons.forEach((btn) => {
    btn.addEventListener("click", () => setActiveCategory(btn.dataset.category, true));
  });

  [resetBtn, emptyResetBtn].forEach((btn) => {
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
      setActiveCategory("all", false);
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
  setActiveCategory(state.category || "all", false);
  renderRecentBar();
  updateStickyOffset();
  scheduleFilterExpiry();

  if (window.location.hash && window.location.hash.startsWith("#term-")) {
    const initialId = window.location.hash.slice("#term-".length);
    window.requestAnimationFrame(() => jumpToTerm(initialId));
  }
})();
