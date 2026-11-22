(() => {
  const sidebar = document.getElementById("courseNavSidebar");
  if (!sidebar) return;

  const courseSlug = sidebar.dataset.courseSlug;
  if (!courseSlug) return;

  // Storage adapter — swap these 3 methods for backend API calls when login is added.
  const CourseStateStore = {
    key(slug) {
      return `shynotes.course.state.v1.${slug}`;
    },
    load(slug) {
      try {
        const raw = window.localStorage.getItem(this.key(slug));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch (_) {
        return null;
      }
    },
    save(slug, state, { silent = false } = {}) {
      try {
        if (state && typeof state === "object" && !silent) {
          state.updatedAt = Date.now();
        }
        window.localStorage.setItem(this.key(slug), JSON.stringify(state));
        if (!silent) {
          window.dispatchEvent(new CustomEvent("shynotes:course-state-saved", { detail: { slug } }));
        }
      } catch (_) {
        // Ignore storage errors (private mode / quota)
      }
    },
    reset(slug) {
      try {
        window.localStorage.removeItem(this.key(slug));
        window.dispatchEvent(new CustomEvent("shynotes:course-state-saved", { detail: { slug } }));
      } catch (_) {
        // Ignore storage errors
      }
    }
  };

  window.ShyNotesCourseStore = CourseStateStore;

  const pageLinks = Array.from(sidebar.querySelectorAll("[data-course-page]"));
  const folderCollapses = Array.from(sidebar.querySelectorAll(".course-folder-collapse[data-folder-key]"));
  const expandAllFoldersBtn = sidebar.querySelector(".course-tree-expand-all");
  const collapseAllFoldersBtn = sidebar.querySelector(".course-tree-collapse-all");
  const branchToggleBtns = Array.from(sidebar.querySelectorAll(".course-branch-toggle[data-branch-target]"));
  const overviewNavLink = document.getElementById("courseNavOverviewLink");
  const glossaryNavLink = document.getElementById("courseNavGlossaryLink");
  const quickRefNavLink = document.getElementById("courseNavQuickRefLink");
  const quickRefNavCount = document.getElementById("courseQuickRefNavCount");
  const studyToolsSection = document.getElementById("courseStudyToolsSection");
  const studyToolsNav = document.getElementById("courseStudyToolsNav");
  const progressBarEl = document.getElementById("courseProgressBar");
  const progressLabelEl = document.getElementById("courseProgressLabel");
  const resetProgressBtn = document.getElementById("resetCourseProgress");
  const reviewToggleBtn = document.getElementById("courseReviewToggleBtn");
  const pageStatusBadgeEl = document.getElementById("coursePageStatusBadge");
  const articleEl = document.getElementById("courseArticleContent");

  const isGlossaryView = document.documentElement.classList.contains("course-view-glossary");
  const isQuickRefView = document.documentElement.classList.contains("course-view-quickref");
  const isMindmapView = document.documentElement.classList.contains("course-view-mindmap");

  if (isGlossaryView || isQuickRefView || isMindmapView) {
    overviewNavLink?.classList.remove("active", "fw-semibold");
    overviewNavLink?.removeAttribute("aria-current");
    if (isGlossaryView || isQuickRefView) {
      const targetNav = isGlossaryView ? glossaryNavLink : quickRefNavLink;
      targetNav?.classList.add("active", "fw-semibold");
      targetNav?.setAttribute("aria-current", "page");
      const baseTitle = document.title;
      const prefix = isGlossaryView ? "Glossary" : "Quick Reference";
      if (!baseTitle.startsWith(prefix)) {
        document.title = `${prefix} · ${baseTitle}`;
      }
    }
  }

  const currentPageUrl = sidebar.dataset.currentUrl || window.location.pathname;
  const allPageUrls = pageLinks.map((el) => el.dataset.pageUrl).filter(Boolean);

  const BOOKMARK_TYPES = {
    return: {
      label: "Return to",
      order: 0,
      iconHtml:
        '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" d="M1.5 1.5A.5.5 0 0 0 1 2v4.8a2.5 2.5 0 0 0 2.5 2.5h9.793l-3.347 3.346a.5.5 0 0 0 .708.708l4.2-4.2a.5.5 0 0 0 0-.708l-4-4a.5.5 0 0 0-.708.708L13.293 8.3H3.5A1.5 1.5 0 0 1 2 6.8V2a.5.5 0 0 0-.5-.5"/></svg>',
      colorClass: "quickref-type-return"
    },
    bookmark: {
      label: "Bookmarked",
      order: 1,
      iconHtml:
        '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2v13.5a.5.5 0 0 0 .74.439L8 13.069l5.26 2.87A.5.5 0 0 0 14 15.5V2a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2"/></svg>',
      colorClass: "quickref-type-bookmark"
    },
    review: {
      label: "Review later",
      order: 2,
      iconHtml:
        '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path d="M14.778.085A.5.5 0 0 1 15 .5V8a.5.5 0 0 1-.314.464L14.5 8l.186.464-.003.001-.006.003-.023.009a12 12 0 0 1-.397.15c-.264.095-.631.223-1.047.35-.816.252-1.879.523-2.71.523-.847 0-1.548-.28-2.158-.525l-.028-.01C7.68 8.71 7.14 8.5 6.5 8.5c-.7 0-1.638.23-2.437.477A20 20 0 0 0 3 9.342V15.5a.5.5 0 0 1-1 0V.5a.5.5 0 0 1 1 0v.282c.226-.079.496-.17.79-.26C4.606.272 5.67 0 6.5 0c.84 0 1.524.277 2.121.519l.043.018C9.286.788 9.828 1 10.5 1c.7 0 1.638-.23 2.437-.477a20 20 0 0 0 1.349-.476l.019-.007.004-.002h.001"/></svg>',
      colorClass: "quickref-type-review"
    }
  };

  function createFreshState() {
    return {
      version: 1,
      courseSlug,
      initializedAt: new Date().toISOString(),
      knownPages: [...allPageUrls],
      folders: {},
      pages: {},
      bookmarks: []
    };
  }

  let state = CourseStateStore.load(courseSlug);
  const isFirstVisit = !state;
  if (!state) {
    state = createFreshState();
    // Silent initial bootstrap so a fresh device never looks "newer" than existing cloud data
    CourseStateStore.save(courseSlug, state, { silent: true });
  } else {
    state.folders = state.folders && typeof state.folders === "object" ? state.folders : {};
    state.pages = state.pages && typeof state.pages === "object" ? state.pages : {};
    state.knownPages = Array.isArray(state.knownPages) ? state.knownPages : [...allPageUrls];
    state.bookmarks = Array.isArray(state.bookmarks) ? state.bookmarks : [];
  }

  function getPageStatus(url, currentRev, isExplicitNew) {
    const record = state.pages[url];
    if (record && record.status === "reviewed") {
      if (record.reviewedRev && currentRev && record.reviewedRev !== currentRev) {
        return "updated";
      }
      return "reviewed";
    }
    const isUnseenNew = !isFirstVisit && !state.knownPages.includes(url);
    if (isUnseenNew || isExplicitNew) {
      return "new";
    }
    return "unreviewed";
  }

  function renderIndicator(indicatorEl, status) {
    if (!indicatorEl) return;
    indicatorEl.className = "course-page-indicator";

    if (status === "reviewed") {
      indicatorEl.classList.add("indicator-reviewed");
      indicatorEl.textContent = "✓";
      indicatorEl.title = "Reviewed";
      indicatorEl.setAttribute("aria-label", "Reviewed");
    } else if (status === "updated") {
      indicatorEl.classList.add("indicator-updated");
      indicatorEl.textContent = "";
      indicatorEl.title = "Updated since last review";
      indicatorEl.setAttribute("aria-label", "Updated since last review");
    } else if (status === "new") {
      indicatorEl.classList.add("indicator-new");
      indicatorEl.textContent = "";
      indicatorEl.title = "New content";
      indicatorEl.setAttribute("aria-label", "New content");
    } else {
      indicatorEl.classList.add("indicator-unreviewed");
      indicatorEl.textContent = "";
      indicatorEl.title = "Not reviewed yet";
      indicatorEl.setAttribute("aria-label", "Not reviewed yet");
    }
  }

  function renderQuickReference() {
    const count = Array.isArray(state.bookmarks) ? state.bookmarks.length : 0;
    if (quickRefNavCount) {
      quickRefNavCount.textContent = String(count);
      quickRefNavCount.classList.toggle("d-none", count === 0);
    }
  }

  function renderAllStatuses() {
    let reviewedCount = 0;
    let currentPageStatus = "unreviewed";

    pageLinks.forEach((link) => {
      const url = link.dataset.pageUrl;
      const rev = link.dataset.pageRev || "";
      const explicitNew = link.dataset.pageNew === "true";
      const status = getPageStatus(url, rev, explicitNew);

      if (status === "reviewed") reviewedCount += 1;
      if (url === currentPageUrl) currentPageStatus = status;

      link.dataset.reviewStatus = status;
      renderIndicator(link.querySelector(".course-page-indicator"), status);
    });

    const total = pageLinks.length;
    const pct = total > 0 ? Math.round((reviewedCount / total) * 100) : 0;

    if (progressBarEl) {
      progressBarEl.style.width = `${pct}%`;
      progressBarEl.setAttribute("aria-valuenow", String(pct));
    }
    if (progressLabelEl) {
      progressLabelEl.textContent = `${reviewedCount} / ${total} reviewed`;
    }

    updateCurrentPageControls(currentPageStatus);
    renderQuickReference();
  }

  function updateCurrentPageControls(status) {
    if (pageStatusBadgeEl) {
      pageStatusBadgeEl.className = "badge rounded-pill";
      if (status === "reviewed") {
        pageStatusBadgeEl.classList.add("text-bg-success-subtle", "text-success-emphasis", "border", "border-success-subtle");
        pageStatusBadgeEl.textContent = "Reviewed";
      } else if (status === "updated") {
        pageStatusBadgeEl.classList.add("text-bg-warning-subtle", "text-warning-emphasis", "border", "border-warning-subtle");
        pageStatusBadgeEl.textContent = "Updated since last review";
      } else if (status === "new") {
        pageStatusBadgeEl.classList.add("text-bg-info-subtle", "text-info-emphasis", "border", "border-info-subtle");
        pageStatusBadgeEl.textContent = "New";
      } else {
        pageStatusBadgeEl.classList.add("text-bg-secondary-subtle", "text-secondary-emphasis", "border");
        pageStatusBadgeEl.textContent = "Not reviewed";
      }
    }

    if (reviewToggleBtn) {
      if (status === "reviewed") {
        reviewToggleBtn.className = "btn btn-sm btn-success";
        reviewToggleBtn.textContent = "Reviewed ✓";
        reviewToggleBtn.setAttribute("aria-pressed", "true");
      } else if (status === "updated") {
        reviewToggleBtn.className = "btn btn-sm btn-warning";
        reviewToggleBtn.textContent = "Mark Updated Content as Reviewed";
        reviewToggleBtn.setAttribute("aria-pressed", "false");
      } else {
        reviewToggleBtn.className = "btn btn-sm btn-outline-primary";
        reviewToggleBtn.textContent = "Mark as Reviewed";
        reviewToggleBtn.setAttribute("aria-pressed", "false");
      }
    }
  }

  function setFolderListOpen(list, open) {
    list.forEach((collapseEl) => {
      const key = collapseEl.dataset.folderKey;
      const toggleBtn = sidebar.querySelector(`[data-bs-target="#${collapseEl.id}"]`);
      if (window.bootstrap?.Collapse) {
        const inst = window.bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false });
        if (open) {
          inst.show();
        } else {
          inst.hide();
        }
      } else {
        collapseEl.classList.toggle("show", open);
      }
      toggleBtn?.setAttribute("aria-expanded", open ? "true" : "false");
      if (key) state.folders[key] = open;
    });
    CourseStateStore.save(courseSlug, state);
    updateBranchToggleStates();
  }

  function getBranchCollapses(rootCollapse) {
    if (!rootCollapse) return [];
    const nested = Array.from(rootCollapse.querySelectorAll(".course-folder-collapse[data-folder-key]"));
    return [rootCollapse, ...nested];
  }

  function updateBranchToggleStates() {
    branchToggleBtns.forEach((btn) => {
      const targetSel = btn.dataset.branchTarget;
      const rootCollapse = targetSel ? sidebar.querySelector(targetSel) : null;
      if (!rootCollapse) return;
      const list = getBranchCollapses(rootCollapse);
      const allOpen = list.every((el) => el.classList.contains("show"));
      const label = btn.dataset.branchLabel || "section";
      const icon = btn.querySelector(".course-branch-icon");
      if (icon) icon.textContent = allOpen ? "«" : "»";
      btn.title = allOpen ? `Collapse all in ${label}` : `Show all in ${label}`;
      btn.setAttribute("aria-label", btn.title);
      btn.dataset.branchAllOpen = allOpen ? "true" : "false";
    });
  }

  function restoreFolderStates() {
    folderCollapses.forEach((collapseEl) => {
      const key = collapseEl.dataset.folderKey;
      const containsActivePage = collapseEl.dataset.hasActivePage === "true";
      const toggleBtn = sidebar.querySelector(`[data-bs-target="#${collapseEl.id}"]`);

      if (containsActivePage) {
        collapseEl.classList.add("show");
        toggleBtn?.setAttribute("aria-expanded", "true");
        return;
      }

      if (Object.prototype.hasOwnProperty.call(state.folders, key)) {
        const shouldBeOpen = Boolean(state.folders[key]);
        collapseEl.classList.toggle("show", shouldBeOpen);
        toggleBtn?.setAttribute("aria-expanded", shouldBeOpen ? "true" : "false");
      }
    });
    updateBranchToggleStates();
  }

  folderCollapses.forEach((collapseEl) => {
    const key = collapseEl.dataset.folderKey;
    collapseEl.addEventListener("shown.bs.collapse", (event) => {
      if (event.target !== collapseEl) return;
      state.folders[key] = true;
      CourseStateStore.save(courseSlug, state);
      updateBranchToggleStates();
    });
    collapseEl.addEventListener("hidden.bs.collapse", (event) => {
      if (event.target !== collapseEl) return;
      state.folders[key] = false;
      CourseStateStore.save(courseSlug, state);
      updateBranchToggleStates();
    });
  });

  expandAllFoldersBtn?.addEventListener("click", () => {
    setFolderListOpen(folderCollapses, true);
  });

  collapseAllFoldersBtn?.addEventListener("click", () => {
    setFolderListOpen(folderCollapses, false);
  });

  branchToggleBtns.forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const targetSel = btn.dataset.branchTarget;
      const rootCollapse = targetSel ? sidebar.querySelector(targetSel) : null;
      if (!rootCollapse) return;
      const list = getBranchCollapses(rootCollapse);
      const allOpen = list.every((el) => el.classList.contains("show"));
      setFolderListOpen(list, !allOpen);
    });
  });

  let autoReviewTimer = null;
  let autoReviewCancelled = false;

  function stopAutoReview() {
    if (autoReviewTimer !== null) {
      window.clearInterval(autoReviewTimer);
      autoReviewTimer = null;
    }
  }

  function markCurrentPageReviewed() {
    const currentLink = pageLinks.find((el) => el.dataset.pageUrl === currentPageUrl);
    const currentRev = currentLink?.dataset.pageRev || reviewToggleBtn?.dataset.pageRev || "";

    state.pages[currentPageUrl] = {
      status: "reviewed",
      reviewedRev: currentRev,
      reviewedAt: new Date().toISOString()
    };

    if (!state.knownPages.includes(currentPageUrl)) {
      state.knownPages.push(currentPageUrl);
    }

    CourseStateStore.save(courseSlug, state);
    renderAllStatuses();
  }

  function startAutoReview() {
    if (document.documentElement.classList.contains("print-mode")) return;
    if (isGlossaryView || isQuickRefView || isMindmapView) return;
    if (autoReviewCancelled) return;

    const currentLink = pageLinks.find((el) => el.dataset.pageUrl === currentPageUrl);
    if (!currentLink) return;

    const currentRev = currentLink.dataset.pageRev || "";
    const explicitNew = currentLink.dataset.pageNew === "true";
    if (getPageStatus(currentPageUrl, currentRev, explicitNew) === "reviewed") {
      return;
    }

    const customSeconds = Number(articleEl?.dataset.autoReviewSeconds);
    let requiredSeconds;
    if (Number.isFinite(customSeconds) && customSeconds > 0) {
      requiredSeconds = customSeconds;
    } else {
      const text = (articleEl?.textContent || "").trim();
      const wordCount = text ? text.split(/\s+/).length : 0;
      const estimatedSeconds = Math.round((wordCount / 220) * 60 * 0.25);
      requiredSeconds = Math.min(45, Math.max(5, estimatedSeconds));
    }

    let activeSeconds = 0;
    let reachedReadingDepth = false;

    function checkScrollDepth() {
      const docHeight = document.documentElement.scrollHeight;
      const viewportHeight = window.innerHeight;
      if (docHeight <= viewportHeight + 80) {
        reachedReadingDepth = true;
        return;
      }
      const scrollProgress = (window.scrollY + viewportHeight) / docHeight;
      if (scrollProgress >= 0.75) {
        reachedReadingDepth = true;
      }
    }

    function maybeComplete() {
      if (autoReviewCancelled) {
        stopAutoReview();
        return;
      }
      checkScrollDepth();
      if (activeSeconds >= requiredSeconds && reachedReadingDepth) {
        stopAutoReview();
        markCurrentPageReviewed();
      }
    }

    checkScrollDepth();
    window.addEventListener("scroll", maybeComplete, { passive: true });

    autoReviewTimer = window.setInterval(() => {
      if (document.hidden) return;
      activeSeconds += 1;
      maybeComplete();
    }, 1000);
  }

  if (reviewToggleBtn) {
    reviewToggleBtn.addEventListener("click", () => {
      const currentLink = pageLinks.find((el) => el.dataset.pageUrl === currentPageUrl);
      const currentRev = currentLink?.dataset.pageRev || reviewToggleBtn.dataset.pageRev || "";
      const existing = state.pages[currentPageUrl];
      const isAlreadyCurrentReviewed =
        existing &&
        existing.status === "reviewed" &&
        (!currentRev || existing.reviewedRev === currentRev);

      if (isAlreadyCurrentReviewed) {
        autoReviewCancelled = true;
        stopAutoReview();
        delete state.pages[currentPageUrl];
        if (!state.knownPages.includes(currentPageUrl)) {
          state.knownPages.push(currentPageUrl);
        }
        CourseStateStore.save(courseSlug, state);
        renderAllStatuses();
      } else {
        stopAutoReview();
        markCurrentPageReviewed();
      }
    });
  }

  if (resetProgressBtn) {
    resetProgressBtn.addEventListener("click", () => {
      if (!window.confirm("Reset your saved progress, bookmarks, and folder states for this course?")) {
        return;
      }
      autoReviewCancelled = true;
      stopAutoReview();
      CourseStateStore.reset(courseSlug);
      state = createFreshState();
      CourseStateStore.save(courseSlug, state);
      folderCollapses.forEach((collapseEl) => {
        const isDefaultOpen = collapseEl.dataset.defaultOpen === "true";
        const toggleBtn = sidebar.querySelector(`[data-bs-target="#${collapseEl.id}"]`);
        collapseEl.classList.toggle("show", isDefaultOpen);
        toggleBtn?.setAttribute("aria-expanded", isDefaultOpen ? "true" : "false");
      });
      updateBranchToggleStates();
      renderAllStatuses();
      window.dispatchEvent(new CustomEvent("shynotes:bookmarks-changed", { detail: { bookmarks: [] } }));
    });
  }

  // Shared bookmark API for course-sections.js
  window.ShyNotesCourseProgress = {
    courseSlug,
    currentPageUrl,
    BOOKMARK_TYPES,
    getBookmarks(url = null) {
      const list = Array.isArray(state.bookmarks) ? state.bookmarks : [];
      return url ? list.filter((b) => b.url === url) : [...list];
    },
    setBookmark({ url = currentPageUrl, pageTitle = "", sectionId, sectionTitle = "", snippet = "", type = "bookmark" }) {
      if (!sectionId || !BOOKMARK_TYPES[type]) return;
      const id = `${url}#${sectionId}`;
      const list = Array.isArray(state.bookmarks) ? [...state.bookmarks] : [];

      // Keep at most one "Return to" marker per page so returning always lands cleanly in one spot
      const filtered = list.filter((item) => {
        if (item.id === id) return false;
        if (type === "return" && item.url === url && item.type === "return") return false;
        return true;
      });

      filtered.push({
        id,
        url,
        pageTitle,
        sectionId,
        sectionTitle,
        snippet,
        type,
        updatedAt: new Date().toISOString()
      });

      state.bookmarks = filtered;
      if (state.deletedBookmarks && state.deletedBookmarks[id]) {
        delete state.deletedBookmarks[id];
      }
      CourseStateStore.save(courseSlug, state);
      renderQuickReference();
      window.dispatchEvent(new CustomEvent("shynotes:bookmarks-changed", { detail: { bookmarks: filtered } }));
    },
    removeBookmark(id) {
      const list = Array.isArray(state.bookmarks) ? state.bookmarks : [];
      const next = list.filter((item) => item.id !== id);
      if (next.length === list.length) return;
      state.bookmarks = next;
      state.deletedBookmarks =
        state.deletedBookmarks && typeof state.deletedBookmarks === "object"
          ? state.deletedBookmarks
          : {};
      state.deletedBookmarks[id] = Date.now();
      CourseStateStore.save(courseSlug, state);
      renderQuickReference();
      window.dispatchEvent(new CustomEvent("shynotes:bookmarks-changed", { detail: { bookmarks: next } }));
    },
    clearBookmarks() {
      const prev = Array.isArray(state.bookmarks) ? state.bookmarks : [];
      state.deletedBookmarks =
        state.deletedBookmarks && typeof state.deletedBookmarks === "object"
          ? state.deletedBookmarks
          : {};
      const now = Date.now();
      prev.forEach((b) => {
        if (b && b.id) state.deletedBookmarks[b.id] = now;
      });
      state.bookmarks = [];
      CourseStateStore.save(courseSlug, state);
      renderQuickReference();
      window.dispatchEvent(new CustomEvent("shynotes:bookmarks-changed", { detail: { bookmarks: [] } }));
    }
  };

  window.addEventListener("shynotes:cloud-applied", () => {
    const reloaded = CourseStateStore.load(courseSlug);
    if (!reloaded) return;
    state = reloaded;
    state.folders = state.folders && typeof state.folders === "object" ? state.folders : {};
    state.pages = state.pages && typeof state.pages === "object" ? state.pages : {};
    state.knownPages = Array.isArray(state.knownPages) ? state.knownPages : [...allPageUrls];
    state.bookmarks = Array.isArray(state.bookmarks) ? state.bookmarks : [];
    restoreFolderStates();
    renderAllStatuses();
    window.dispatchEvent(new CustomEvent("shynotes:bookmarks-changed", { detail: { bookmarks: state.bookmarks } }));
  });

  restoreFolderStates();
  renderAllStatuses();
  startAutoReview();

  const activeLink = sidebar.querySelector(".nav-link.active");
  activeLink?.scrollIntoView({ block: "nearest" });
})();
