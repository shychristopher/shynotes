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

  const printTitleEl = document.getElementById("glossaryPrintTitle");
  const printCountEl = document.getElementById("glossaryPrintCount");
  const printMasonryEl = document.getElementById("glossaryPrintMasonry");
  const printFilterNoticeEl = document.getElementById("glossaryPrintFilterNotice");
  const printFilterSummaryEl = document.getElementById("glossaryPrintFilterSummary");
  const printShowAllBtn = document.getElementById("glossaryPrintShowAllBtn");
  const previewPrintBtn = document.getElementById("glossaryPreviewPrintBtn");
  const printPreviewLink = document.getElementById("glossaryPrintPreviewLink");
  const printOptCheckboxes = Array.from(document.querySelectorAll(".glossary-print-opt"));
  const printOptSelects = Array.from(document.querySelectorAll(".glossary-print-select"));
  const printLayoutTiles = Array.from(document.querySelectorAll(".print-layout-tile"));
  const printColSubOptionsEl = document.getElementById("printColSubOptions");
  const printColSubHeadingEl = document.getElementById("printColSubHeading");
  const printOptColDividersLabelEl = document.getElementById("printOptColDividersLabel");

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

  const catLabelByValue = new Map();
  catCheckboxes.forEach((cb) => {
    const labelSpan = document.querySelector(`label[for="${cb.id}"] span`);
    catLabelByValue.set(cb.value, labelSpan ? labelSpan.textContent.trim() : cb.value);
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
      recentSearches: [],
      printOptions: {
        sections: false,
        categories: false,
        related: false,
        cards: false,
        font: "md",
        spacing: "normal",
        columns: "1",
        colGap: "normal",
        colDividers: true
      }
    };
  }

  let state = readStorage() || createEmptyState();
  if (!Array.isArray(state.categories)) {
    state.categories =
      typeof state.category === "string" && state.category !== "all" ? [state.category] : [];
  }
  state.recentTerms = Array.isArray(state.recentTerms) ? state.recentTerms : [];
  state.recentSearches = Array.isArray(state.recentSearches) ? state.recentSearches : [];
  state.printOptions = Object.assign(
    {
      sections: false,
      categories: false,
      related: false,
      cards: false,
      font: "md",
      spacing: "normal",
      columns: "1",
      colGap: "normal",
      colDividers: true
    },
    state.printOptions && typeof state.printOptions === "object" ? state.printOptions : {}
  );

  // Allow optional URL overrides in ?print mode
  const urlParams = new URLSearchParams(window.location.search);
  ["sections", "categories", "related", "cards", "colDividers"].forEach((opt) => {
    if (urlParams.has(opt)) {
      const val = urlParams.get(opt);
      state.printOptions[opt] = val !== "0" && val !== "false";
    }
  });
  const validFonts = ["sm", "md", "lg"];
  const validSpacings = ["compact", "normal", "relaxed"];
  const validColumns = ["1", "split", "2", "3"];
  const validColGaps = ["tight", "normal", "wide"];
  if (validFonts.includes(urlParams.get("font"))) {
    state.printOptions.font = urlParams.get("font");
  }
  if (validSpacings.includes(urlParams.get("spacing"))) {
    state.printOptions.spacing = urlParams.get("spacing");
  }
  if (validColumns.includes(urlParams.get("columns"))) {
    state.printOptions.columns = urlParams.get("columns");
  }
  if (validColGaps.includes(urlParams.get("colGap"))) {
    state.printOptions.colGap = urlParams.get("colGap");
  }

  function applyPrintOptions(shouldPersist = true) {
    const opts = state.printOptions;
    const font = validFonts.includes(opts.font) ? opts.font : "md";
    const spacing = validSpacings.includes(opts.spacing) ? opts.spacing : "normal";
    const columns = validColumns.includes(String(opts.columns)) ? String(opts.columns) : "1";
    const colGap = validColGaps.includes(opts.colGap) ? opts.colGap : "normal";
    opts.font = font;
    opts.spacing = spacing;
    opts.columns = columns;
    opts.colGap = colGap;

    root.classList.toggle("print-show-sections", Boolean(opts.sections));
    root.classList.toggle("print-show-categories", Boolean(opts.categories));
    root.classList.toggle("print-show-related", Boolean(opts.related));
    root.classList.toggle("print-card-layout", Boolean(opts.cards));
    root.classList.toggle("print-col-dividers", Boolean(opts.colDividers));

    validFonts.forEach((f) => root.classList.toggle(`print-font-${f}`, f === font));
    validSpacings.forEach((s) => root.classList.toggle(`print-space-${s}`, s === spacing));
    validColumns.forEach((c) => root.classList.toggle(`print-cols-${c}`, c === columns));
    validColGaps.forEach((g) => root.classList.toggle(`print-colgap-${g}`, g === colGap));

    const isMultiCol = columns !== "1";
    printColSubOptionsEl?.classList.toggle("d-none", !isMultiCol);
    printColSubOptionsEl?.classList.toggle("d-flex", isMultiCol);
    if (printColSubHeadingEl) {
      printColSubHeadingEl.textContent = columns === "split" ? "Study Sheet Options" : "Column Options";
    }
    if (printOptColDividersLabelEl) {
      printOptColDividersLabelEl.textContent =
        columns === "split" ? "Fold & row dividers" : "Column divider lines";
    }

    printLayoutTiles.forEach((tile) => {
      const isSelected = tile.dataset.layoutValue === columns;
      tile.classList.toggle("active", isSelected);
      tile.setAttribute("aria-checked", isSelected ? "true" : "false");
    });

    printOptCheckboxes.forEach((cb) => {
      const key = cb.dataset.printOpt;
      if (key) cb.checked = Boolean(opts[key]);
    });

    printOptSelects.forEach((sel) => {
      const key = sel.dataset.printSelect;
      if (key && opts[key]) sel.value = String(opts[key]);
    });

    if (printPreviewLink) {
      const previewParams = new URLSearchParams();
      previewParams.set("print", "1");
      if (opts.sections) previewParams.set("sections", "1");
      if (opts.categories) previewParams.set("categories", "1");
      if (opts.related) previewParams.set("related", "1");
      if (opts.cards) previewParams.set("cards", "1");
      if (font !== "md") previewParams.set("font", font);
      if (spacing !== "normal") previewParams.set("spacing", spacing);
      if (columns !== "1") previewParams.set("columns", columns);
      if (colGap !== "normal") previewParams.set("colGap", colGap);
      if (!opts.colDividers) previewParams.set("colDividers", "0");
      printPreviewLink.setAttribute("href", `?${previewParams.toString()}`);
    }

    if (shouldPersist) {
      writeStorage(state);
    }

    syncPrintMasonry();
  }

  function estimateTermWeight(card) {
    const baseText = (card.querySelector(".glossary-term-title")?.textContent || "").length +
      (card.querySelector(".glossary-term-full")?.textContent || "").length +
      (card.querySelector(".glossary-term-def")?.textContent || "").length;
    const linksWeight = state.printOptions.related
      ? (card.querySelector(".glossary-term-links")?.textContent || "").trim().length * 0.6
      : 0;
    return baseText + linksWeight + 55;
  }

  function buildPrintMasonry() {
    if (!printMasonryEl) return;
    const numCols = Number(state.printOptions.columns) || 1;
    if (numCols <= 1) {
      clearPrintMasonry();
      return;
    }

    const showSections = Boolean(state.printOptions.sections);
    const items = [];

    letterGroups.forEach((group) => {
      if (group.classList.contains("d-none")) return;
      const visibleCards = Array.from(group.querySelectorAll(".glossary-term-card:not(.d-none)"));
      if (!visibleCards.length) return;

      const headingEl = group.querySelector(".glossary-letter-heading");
      visibleCards.forEach((card, idx) => {
        items.push({
          card,
          heading: showSections && idx === 0 ? headingEl : null,
          weight: estimateTermWeight(card) + (showSections && idx === 0 ? 45 : 0)
        });
      });
    });

    if (!items.length) {
      clearPrintMasonry();
      return;
    }

    // Balance items sequentially across columns by estimated height so each column packs
    // tightly (Pinterest-style, zero row-height dead space) while staying alphabetical.
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    const targetPerCol = totalWeight / numCols;

    const buckets = Array.from({ length: numCols }, () => []);
    let colIdx = 0;
    let colWeight = 0;

    items.forEach((item, index) => {
      const remainingItems = items.length - index;
      const remainingCols = numCols - colIdx;

      if (
        colIdx < numCols - 1 &&
        buckets[colIdx].length > 0 &&
        (colWeight + item.weight * 0.5 > targetPerCol || remainingItems === remainingCols - 1)
      ) {
        colIdx += 1;
        colWeight = 0;
      }

      buckets[colIdx].push(item);
      colWeight += item.weight;
    });

    printMasonryEl.innerHTML = "";
    buckets.forEach((bucket) => {
      const colDiv = document.createElement("div");
      colDiv.className = "glossary-masonry-col";
      bucket.forEach((entry) => {
        if (entry.heading) {
          const clonedHeading = entry.heading.cloneNode(true);
          clonedHeading.removeAttribute("id");
          colDiv.appendChild(clonedHeading);
        }
        const clonedCard = entry.card.cloneNode(true);
        clonedCard.removeAttribute("id");
        colDiv.appendChild(clonedCard);
      });
      printMasonryEl.appendChild(colDiv);
    });

    root.classList.add("has-print-masonry");
  }

  function clearPrintMasonry() {
    if (!printMasonryEl) return;
    printMasonryEl.innerHTML = "";
    root.classList.remove("has-print-masonry");
  }

  function syncPrintMasonry(force = false) {
    const isPrintPreview = document.documentElement.classList.contains("print-mode");
    const colMode = String(state.printOptions.columns || "1");
    const numCols = colMode === "2" ? 2 : colMode === "3" ? 3 : 1;
    if ((isPrintPreview || force) && numCols > 1) {
      buildPrintMasonry();
    } else {
      clearPrintMasonry();
    }
  }

  function updatePrintHeader(rawQuery, selectedCategories, totalVisible) {
    const parts = [];
    if (selectedCategories.length > 0) {
      const labels = selectedCategories.map((val) => catLabelByValue.get(val) || val);
      parts.push(labels.join(", "));
    }
    const trimmed = (rawQuery || "").trim();
    if (trimmed.length > 0) {
      parts.push(`“${trimmed}”`);
    }

    if (printTitleEl) {
      printTitleEl.textContent = parts.length > 0 ? `Glossary — ${parts.join(" · ")}` : "Glossary";
    }

    if (printCountEl) {
      printCountEl.textContent = `${totalVisible} ${totalVisible === 1 ? "term" : "terms"}`;
    }

    if (printFilterNoticeEl) {
      const isFiltered = parts.length > 0;
      printFilterNoticeEl.classList.toggle("d-none", !isFiltered);
      if (isFiltered && printFilterSummaryEl) {
        printFilterSummaryEl.textContent = `Showing ${totalVisible} ${totalVisible === 1 ? "term" : "terms"} matching ${parts.join(" · ")}.`;
      }
    }
  }

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
    const rawQuery = searchInput?.value || "";
    const query = rawQuery.trim().toLowerCase();
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

    updatePrintHeader(rawQuery, selectedCategories, totalVisible);

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

    syncPrintMasonry();
  }

  function resetFilters() {
    if (searchRecordTimer !== null) {
      window.clearTimeout(searchRecordTimer);
      searchRecordTimer = null;
    }
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

  function jumpToTerm(termId, shouldRecord = true) {
    const targetCard = document.getElementById(`term-${termId}`);
    if (!targetCard) return;

    if (targetCard.classList.contains("d-none")) {
      resetFilters();
    }

    if (shouldRecord) {
      recordRecentTerm(termId);
    }
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

  printOptCheckboxes.forEach((cb) => {
    cb.addEventListener("change", () => {
      const key = cb.dataset.printOpt;
      if (!key) return;
      state.printOptions[key] = cb.checked;
      applyPrintOptions(true);
    });
  });

  printOptSelects.forEach((sel) => {
    sel.addEventListener("change", () => {
      const key = sel.dataset.printSelect;
      if (!key) return;
      state.printOptions[key] = sel.value;
      applyPrintOptions(true);
    });
  });

  printLayoutTiles.forEach((tile) => {
    tile.addEventListener("click", () => {
      const val = tile.dataset.layoutValue;
      if (!val) return;
      state.printOptions.columns = val;
      applyPrintOptions(true);
    });
  });

  previewPrintBtn?.addEventListener("click", () => window.print());

  clearCatsBtn?.addEventListener("click", () => {
    setSelectedCategories([]);
    applyGlossaryFilters(true);
  });

  [resetBtn, sidebarResetBtn, emptyResetBtn, printShowAllBtn].forEach((btn) => {
    btn?.addEventListener("click", resetFilters);
  });

  clearRecentBtn?.addEventListener("click", () => {
    if (searchRecordTimer !== null) {
      window.clearTimeout(searchRecordTimer);
      searchRecordTimer = null;
    }
    state.recentTerms = [];
    state.recentSearches = [];
    state.recentUpdatedAt = null;
    writeStorage(state);
    if (window.location.hash && window.location.hash.startsWith("#term-")) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
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

  window.addEventListener("beforeprint", () => syncPrintMasonry(true));
  window.addEventListener("afterprint", () => syncPrintMasonry(false));

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function isAcronym(phrase) {
    return phrase.length <= 6 && phrase === phrase.toUpperCase() && /[A-Z]/.test(phrase);
  }

  function populateCourseMentions() {
    const indexEl = document.getElementById("coursePagesIndex");
    if (!indexEl) return;

    let pages;
    try {
      pages = JSON.parse(indexEl.textContent || "[]");
    } catch (_) {
      return;
    }
    if (!Array.isArray(pages) || !pages.length) return;

    termCards.forEach((card) => {
      const mentionsRow = card.querySelector(".glossary-mentions-row");
      if (!mentionsRow) return;

      const mainTerm = (card.dataset.term || "").trim();
      const aliases = (card.dataset.aliases || "")
        .split("|")
        .map((s) => s.trim())
        .filter((s) => s.length >= 2);
      const phrases = [mainTerm, ...aliases].filter((s) => s.length >= 2);
      if (!phrases.length) return;

      const matchers = phrases.map((p) => {
        const flags = isAcronym(p) ? "" : "i";
        return new RegExp(`\\b${escapeRegex(p)}\\b`, flags);
      });

      const matchedPages = pages.filter(
        (pg) => typeof pg.text === "string" && matchers.some((rx) => rx.test(pg.text))
      );

      if (!matchedPages.length) return;

      mentionsRow.innerHTML = "";
      const label = document.createElement("span");
      label.className = "glossary-link-label text-body-secondary me-1";
      label.style.fontSize = "0.75rem";
      label.textContent = "Mentioned in:";
      mentionsRow.appendChild(label);

      matchedPages.forEach((pg) => {
        const link = document.createElement("a");
        link.href = pg.url;
        link.className =
          "badge rounded-pill bg-body-tertiary border text-body text-decoration-none fw-normal glossary-ref-link";
        link.textContent = pg.title;
        link.title = `Open ${pg.title}`;
        mentionsRow.appendChild(link);
      });

      mentionsRow.classList.remove("d-none");
      mentionsRow.classList.add("d-flex");
    });
  }

  // Initialize from stored per-course glossary state (with optional ?categories=... URL pre-filter)
  pruneExpiredState();

  const urlCatParam = urlParams.get("categories") || urlParams.get("category");
  let appliedUrlCategoryFilter = false;
  if (urlCatParam) {
    const requestedCats = urlCatParam
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s && catLabelByValue.has(s));
    if (requestedCats.length > 0) {
      state.categories = requestedCats;
      state.query = "";
      state.filterUpdatedAt = Date.now();
      appliedUrlCategoryFilter = true;
    }
  }

  populateCourseMentions();

  if (searchInput && typeof state.query === "string") {
    searchInput.value = state.query;
  }
  setSelectedCategories(state.categories);
  applyPrintOptions(false);
  applyGlossaryFilters(appliedUrlCategoryFilter);
  renderRecentBar();
  updateStickyOffset();
  scheduleFilterExpiry();

  if (window.location.hash && window.location.hash.startsWith("#term-")) {
    const initialId = window.location.hash.slice("#term-".length);
    window.requestAnimationFrame(() => jumpToTerm(initialId, false));
  }
})();
