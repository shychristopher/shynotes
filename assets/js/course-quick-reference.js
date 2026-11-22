(() => {
  const root = document.getElementById("courseQuickReference");
  const progressApi = window.ShyNotesCourseProgress;
  if (!root || !progressApi) return;
  if (root.closest(".course-view-only-quickref") && !document.documentElement.classList.contains("course-view-quickref")) {
    return;
  }

  const controlsEl = document.getElementById("quickRefControls");
  const groupsEl = document.getElementById("quickRefGroups");
  const emptyEl = document.getElementById("quickRefEmpty");
  const noMatchesEl = document.getElementById("quickRefNoMatches");
  const searchInput = document.getElementById("quickRefSearch");
  const shownCountEl = document.getElementById("quickRefShownCount");
  const clearAllBtn = document.getElementById("quickRefClearAllBtn");
  const resetFilterBtn = document.getElementById("quickRefResetFilterBtn");
  const expandAllBtn = document.getElementById("quickRefExpandAllBtn");
  const collapseAllBtn = document.getElementById("quickRefCollapseAllBtn");
  const filterBtns = Array.from(root.querySelectorAll(".quickref-filter-btn"));

  const GROUPS_META = [
    { key: "return", heading: "Return To (Continue Studying)", badge: "Return to", pillClass: "article-bookmark-pill-return" },
    { key: "bookmark", heading: "Bookmarked (Quick Reference)", badge: "Bookmarked", pillClass: "article-bookmark-pill-bookmark" },
    { key: "review", heading: "Review Later", badge: "Review later", pillClass: "article-bookmark-pill-review" }
  ];

  const ICONS = {
    return:
      '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" d="M1.5 1.5A.5.5 0 0 0 1 2v4.8a2.5 2.5 0 0 0 2.5 2.5h9.793l-3.347 3.346a.5.5 0 0 0 .708.708l4.2-4.2a.5.5 0 0 0 0-.708l-4-4a.5.5 0 0 0-.708.708L13.293 8.3H3.5A1.5 1.5 0 0 1 2 6.8V2a.5.5 0 0 0-.5-.5"/></svg>',
    bookmark:
      '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2v13.5a.5.5 0 0 0 .74.439L8 13.069l5.26 2.87A.5.5 0 0 0 14 15.5V2a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2"/></svg>',
    review:
      '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path d="M14.778.085A.5.5 0 0 1 15 .5V8a.5.5 0 0 1-.314.464L14.5 8l.186.464-.003.001-.006.003-.023.009a12 12 0 0 1-.397.15c-.264.095-.631.223-1.047.35-.816.252-1.879.523-2.71.523-.847 0-1.548-.28-2.158-.525l-.028-.01C7.68 8.71 7.14 8.5 6.5 8.5c-.7 0-1.638.23-2.437.477A20 20 0 0 0 3 9.342V15.5a.5.5 0 0 1-1 0V.5a.5.5 0 0 1 1 0v.282c.226-.079.496-.17.79-.26C4.606.272 5.67 0 6.5 0c.84 0 1.524.277 2.121.519l.043.018C9.286.788 9.828 1 10.5 1c.7 0 1.638-.23 2.437-.477a20 20 0 0 0 1.349-.476l.019-.007.004-.002h.001"/></svg>'
  };

  let activeFilter = "all";
  let searchQuery = "";
  const expandedCards = new Set();
  const pageDomCache = new Map();

  function slugify(str) {
    return String(str || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  async function fetchSectionHtml(url, sectionId, sectionTitle) {
    try {
      let doc = pageDomCache.get(url);
      if (!doc) {
        const res = await fetch(url, { credentials: "same-origin" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        doc = new window.DOMParser().parseFromString(html, "text/html");
        pageDomCache.set(url, doc);
      }

      const article = doc.getElementById("courseArticleContent");
      if (!article) return '<p class="small text-body-secondary mb-0">Could not preview this section.</p>';

      const headings = Array.from(article.querySelectorAll("h2, h3, h4"));
      const targetHeading = headings.find(
        (h) =>
          h.id === sectionId ||
          slugify(h.textContent) === sectionId ||
          (sectionTitle && (h.textContent || "").trim().toLowerCase() === sectionTitle.toLowerCase())
      );

      if (!targetHeading) {
        return '<p class="small text-body-secondary mb-0">Section heading was renamed or moved—click “Open in Lesson” to view.</p>';
      }

      const targetLevel = Number(targetHeading.tagName.slice(1));
      const container = document.createElement("div");
      let sibling = targetHeading.nextElementSibling;
      while (sibling) {
        if (/^H[1-6]$/.test(sibling.tagName)) {
          const sibLevel = Number(sibling.tagName.slice(1));
          if (sibLevel <= targetLevel) break;
        }
        container.appendChild(sibling.cloneNode(true));
        sibling = sibling.nextElementSibling;
      }

      return container.innerHTML.trim() || '<p class="small text-body-secondary mb-0">No additional notes under this heading.</p>';
    } catch (_) {
      return '<p class="small text-body-secondary mb-0">Could not load preview.</p>';
    }
  }

  function createCard(bm, groupMeta) {
    const card = document.createElement("div");
    card.className = `card border quickref-card bm-type-${bm.type}`;
    card.dataset.bookmarkId = bm.id;

    const href = bm.sectionId ? `${bm.url}#${encodeURIComponent(bm.sectionId)}` : bm.url;
    const isExpanded = expandedCards.has(bm.id);

    card.innerHTML = `
      <div class="card-body py-3 px-3">
        <div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-1">
          <div style="min-width: 0;">
            <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
              <span class="article-bookmark-pill ${groupMeta.pillClass}">
                ${ICONS[bm.type] || ""} <span>${groupMeta.badge}</span>
              </span>
              ${bm.pageTitle ? `<span class="small text-body-secondary">${escapeHtml(bm.pageTitle)}</span>` : ""}
            </div>
            <h3 class="h6 fw-bold mb-0">
              <a href="${escapeAttr(href)}" class="text-decoration-none text-body">
                ${escapeHtml(bm.sectionTitle || bm.pageTitle || "Saved section")}
              </a>
            </h3>
          </div>

          <div class="d-inline-flex align-items-center gap-1 flex-shrink-0">
            <div class="dropdown">
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary py-0 px-2"
                data-bs-toggle="dropdown"
                aria-expanded="false"
                style="font-size: 0.74rem;"
                title="Change bookmark type"
              >
                Move ▾
              </button>
              <ul class="dropdown-menu dropdown-menu-end shadow-sm">
                <li>
                  <button type="button" class="dropdown-item small d-flex align-items-center gap-2${bm.type === "return" ? " active" : ""}" data-move-type="return">
                    <span class="quickref-type-return">${ICONS.return}</span> Return to
                  </button>
                </li>
                <li>
                  <button type="button" class="dropdown-item small d-flex align-items-center gap-2${bm.type === "bookmark" ? " active" : ""}" data-move-type="bookmark">
                    <span class="quickref-type-bookmark">${ICONS.bookmark}</span> Bookmark
                  </button>
                </li>
                <li>
                  <button type="button" class="dropdown-item small d-flex align-items-center gap-2${bm.type === "review" ? " active" : ""}" data-move-type="review">
                    <span class="quickref-type-review">${ICONS.review}</span> Review later
                  </button>
                </li>
              </ul>
            </div>
            <button
              type="button"
              class="btn btn-sm btn-outline-danger py-0 px-2 quickref-card-remove"
              style="font-size: 0.74rem;"
              title="Remove bookmark"
            >
              Remove
            </button>
          </div>
        </div>

        ${bm.snippet ? `<p class="small text-body-secondary mb-2 quickref-snippet${isExpanded ? " d-none" : ""}">${escapeHtml(bm.snippet)}</p>` : ""}

        <div class="quickref-preview-body mt-2 pt-2 border-top${isExpanded ? "" : " d-none"}">
          <div class="small text-body-secondary">Loading section notes…</div>
        </div>

        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2 pt-2 border-top">
          <button
            type="button"
            class="btn btn-link btn-sm p-0 text-decoration-none quickref-preview-toggle"
            aria-expanded="${isExpanded ? "true" : "false"}"
            style="font-size: 0.78rem;"
          >
            ${isExpanded ? "Hide notes ▴" : "Show notes ▾"}
          </button>
          <a href="${escapeAttr(href)}" class="small text-decoration-none fw-medium">
            Open in Lesson →
          </a>
        </div>
      </div>
    `;

    const previewBody = card.querySelector(".quickref-preview-body");
    const previewToggle = card.querySelector(".quickref-preview-toggle");
    const snippetEl = card.querySelector(".quickref-snippet");

    async function ensurePreviewLoaded() {
      if (!previewBody || previewBody.dataset.loaded === "true") return;
      previewBody.dataset.loaded = "loading";
      const html = await fetchSectionHtml(bm.url, bm.sectionId, bm.sectionTitle);
      previewBody.innerHTML = html;
      Array.from(previewBody.querySelectorAll("table")).forEach((table) => {
        if (table.closest(".course-table-scroll")) return;
        const wrap = document.createElement("div");
        wrap.className = "course-table-scroll";
        table.parentNode.insertBefore(wrap, table);
        wrap.appendChild(table);
      });
      previewBody.dataset.loaded = "true";
    }

    if (isExpanded) {
      ensurePreviewLoaded();
    }

    previewToggle?.addEventListener("click", () => {
      const nowOpen = previewBody.classList.contains("d-none");
      previewBody.classList.toggle("d-none", !nowOpen);
      snippetEl?.classList.toggle("d-none", nowOpen);
      previewToggle.setAttribute("aria-expanded", nowOpen ? "true" : "false");
      previewToggle.textContent = nowOpen ? "Hide notes ▴" : "Show notes ▾";
      if (nowOpen) {
        expandedCards.add(bm.id);
        ensurePreviewLoaded();
      } else {
        expandedCards.delete(bm.id);
      }
    });

    card.querySelectorAll("[data-move-type]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const nextType = btn.dataset.moveType;
        if (!nextType || nextType === bm.type) return;
        progressApi.setBookmark({
          url: bm.url,
          pageTitle: bm.pageTitle,
          sectionId: bm.sectionId,
          sectionTitle: bm.sectionTitle,
          snippet: bm.snippet || "",
          type: nextType
        });
      });
    });

    card.querySelector(".quickref-card-remove")?.addEventListener("click", () => {
      expandedCards.delete(bm.id);
      progressApi.removeBookmark(bm.id);
    });

    return card;
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(str) {
    return escapeHtml(str);
  }

  function render() {
    const allBookmarks = progressApi.getBookmarks();
    const hasAny = allBookmarks.length > 0;

    controlsEl?.classList.toggle("d-none", !hasAny);
    emptyEl?.classList.toggle("d-none", hasAny);

    if (!hasAny) {
      if (groupsEl) groupsEl.innerHTML = "";
      noMatchesEl?.classList.add("d-none");
      return;
    }

    // Update tab counts
    const counts = { all: allBookmarks.length, return: 0, bookmark: 0, review: 0 };
    allBookmarks.forEach((b) => {
      if (counts[b.type] !== undefined) counts[b.type] += 1;
    });

    root.querySelectorAll("[data-filter-count]").forEach((badge) => {
      const key = badge.dataset.filterCount;
      if (key && counts[key] !== undefined) badge.textContent = String(counts[key]);
    });

    filterBtns.forEach((btn) => {
      const isSelected = btn.dataset.filter === activeFilter;
      btn.classList.toggle("active", isSelected);
      btn.classList.toggle("btn-primary", isSelected);
      btn.classList.toggle("btn-outline-secondary", !isSelected);
    });

    const q = searchQuery.trim().toLowerCase();
    const visible = allBookmarks.filter((bm) => {
      const matchesType = activeFilter === "all" || bm.type === activeFilter;
      if (!matchesType) return false;
      if (!q) return true;
      const hay = `${bm.sectionTitle || ""} ${bm.pageTitle || ""} ${bm.snippet || ""}`.toLowerCase();
      return hay.includes(q);
    });

    if (shownCountEl) {
      shownCountEl.textContent = `${visible.length} ${visible.length === 1 ? "saved section" : "saved sections"}`;
    }

    if (groupsEl) groupsEl.innerHTML = "";
    noMatchesEl?.classList.toggle("d-none", visible.length > 0);
    if (!visible.length) return;

    GROUPS_META.forEach((meta) => {
      const items = visible
        .filter((b) => b.type === meta.key)
        .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
      if (!items.length) return;

      const groupWrap = document.createElement("div");
      if (activeFilter === "all") {
        const heading = document.createElement("h2");
        heading.className = "h6 fw-bold text-body-secondary text-uppercase border-bottom pb-2 mb-3";
        heading.style.letterSpacing = "0.04em";
        heading.style.fontSize = "0.78rem";
        heading.textContent = `${meta.heading} (${items.length})`;
        groupWrap.appendChild(heading);
      }

      const list = document.createElement("div");
      list.className = "d-flex flex-column gap-3";
      items.forEach((bm) => list.appendChild(createCard(bm, meta)));
      groupWrap.appendChild(list);
      groupsEl?.appendChild(groupWrap);
    });
  }

  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      activeFilter = btn.dataset.filter || "all";
      render();
    });
  });

  searchInput?.addEventListener("input", () => {
    searchQuery = searchInput.value || "";
    render();
  });

  resetFilterBtn?.addEventListener("click", () => {
    activeFilter = "all";
    searchQuery = "";
    if (searchInput) searchInput.value = "";
    render();
  });

  expandAllBtn?.addEventListener("click", () => {
    progressApi.getBookmarks().forEach((b) => expandedCards.add(b.id));
    render();
  });

  collapseAllBtn?.addEventListener("click", () => {
    expandedCards.clear();
    render();
  });

  clearAllBtn?.addEventListener("click", () => {
    if (!window.confirm("Remove all saved bookmarks, return-to spots, and review-later flags for this course?")) {
      return;
    }
    expandedCards.clear();
    progressApi.clearBookmarks();
  });

  window.addEventListener("shynotes:bookmarks-changed", render);
  render();
})();
