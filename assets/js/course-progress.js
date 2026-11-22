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
    save(slug, state) {
      try {
        window.localStorage.setItem(this.key(slug), JSON.stringify(state));
      } catch (_) {
        // Ignore storage errors (private mode / quota)
      }
    },
    reset(slug) {
      try {
        window.localStorage.removeItem(this.key(slug));
      } catch (_) {
        // Ignore storage errors
      }
    }
  };

  window.ShyNotesCourseStore = CourseStateStore;

  const pageLinks = Array.from(sidebar.querySelectorAll("[data-course-page]"));
  const folderCollapses = Array.from(sidebar.querySelectorAll(".course-folder-collapse[data-folder-key]"));
  const progressBarEl = document.getElementById("courseProgressBar");
  const progressLabelEl = document.getElementById("courseProgressLabel");
  const resetProgressBtn = document.getElementById("resetCourseProgress");
  const reviewToggleBtn = document.getElementById("courseReviewToggleBtn");
  const pageStatusBadgeEl = document.getElementById("coursePageStatusBadge");

  const currentPageUrl = sidebar.dataset.currentUrl || window.location.pathname;
  const allPageUrls = pageLinks.map((el) => el.dataset.pageUrl).filter(Boolean);

  function createFreshState() {
    return {
      version: 1,
      courseSlug,
      initializedAt: new Date().toISOString(),
      knownPages: [...allPageUrls],
      folders: {},
      pages: {}
    };
  }

  let state = CourseStateStore.load(courseSlug);
  const isFirstVisit = !state;
  if (!state) {
    state = createFreshState();
    CourseStateStore.save(courseSlug, state);
  } else {
    state.folders = state.folders && typeof state.folders === "object" ? state.folders : {};
    state.pages = state.pages && typeof state.pages === "object" ? state.pages : {};
    state.knownPages = Array.isArray(state.knownPages) ? state.knownPages : [...allPageUrls];
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
  }

  folderCollapses.forEach((collapseEl) => {
    const key = collapseEl.dataset.folderKey;
    collapseEl.addEventListener("shown.bs.collapse", () => {
      state.folders[key] = true;
      CourseStateStore.save(courseSlug, state);
    });
    collapseEl.addEventListener("hidden.bs.collapse", () => {
      state.folders[key] = false;
      CourseStateStore.save(courseSlug, state);
    });
  });

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
        delete state.pages[currentPageUrl];
      } else {
        state.pages[currentPageUrl] = {
          status: "reviewed",
          reviewedRev: currentRev,
          reviewedAt: new Date().toISOString()
        };
      }

      if (!state.knownPages.includes(currentPageUrl)) {
        state.knownPages.push(currentPageUrl);
      }

      CourseStateStore.save(courseSlug, state);
      renderAllStatuses();
    });
  }

  if (resetProgressBtn) {
    resetProgressBtn.addEventListener("click", () => {
      if (!window.confirm("Reset your saved progress and folder states for this course?")) {
        return;
      }
      CourseStateStore.reset(courseSlug);
      state = createFreshState();
      CourseStateStore.save(courseSlug, state);
      folderCollapses.forEach((collapseEl) => {
        const isDefaultOpen = collapseEl.dataset.defaultOpen === "true";
        const toggleBtn = sidebar.querySelector(`[data-bs-target="#${collapseEl.id}"]`);
        collapseEl.classList.toggle("show", isDefaultOpen);
        toggleBtn?.setAttribute("aria-expanded", isDefaultOpen ? "true" : "false");
      });
      renderAllStatuses();
    });
  }

  restoreFolderStates();
  renderAllStatuses();
})();
