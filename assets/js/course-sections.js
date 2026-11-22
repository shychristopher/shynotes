(() => {
  if (document.documentElement.classList.contains("print-mode")) return;
  if (
    document.documentElement.classList.contains("course-view-glossary") ||
    document.documentElement.classList.contains("course-view-quickref")
  ) {
    return;
  }

  const articleEl = document.getElementById("courseArticleContent");
  if (!articleEl) return;

  const progressApi = window.ShyNotesCourseProgress || null;
  const currentUrl = progressApi?.currentPageUrl || window.location.pathname;
  const pageTitleEl = document.querySelector(".content-screen-header h1");
  const currentPageTitle = (pageTitleEl?.textContent || document.title || "").trim();

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function isAcronym(phrase) {
    return phrase.length <= 6 && phrase === phrase.toUpperCase() && /[A-Z]/.test(phrase);
  }

  function termAppearsInText(termObj, text) {
    if (!text || !termObj || !termObj.term) return false;
    const phrases = [termObj.term];
    if (Array.isArray(termObj.aliases)) {
      termObj.aliases.forEach((a) => {
        if (typeof a === "string" && a.trim().length >= 2) phrases.push(a.trim());
      });
    }
    return phrases.some((p) => {
      const clean = (p || "").trim();
      if (clean.length < 2) return false;
      const flags = isAcronym(clean) ? "" : "i";
      return new RegExp(`\\b${escapeRegex(clean)}\\b`, flags).test(text);
    });
  }

  // 1. Populate page-specific Key Terms strictly from glossary terms actually found on THIS page
  const keyTermsCard = document.getElementById("sectionKeyTerms");
  const keyTermsBody = document.getElementById("sectionKeyTermsBody");
  const keyTermsToggle = document.getElementById("sectionKeyTermsToggle");
  const keyTermsList = document.getElementById("sectionKeyTermsList");
  const keyTermsCount = document.getElementById("sectionKeyTermsCount");
  const keyTermsLink = document.getElementById("sectionKeyTermsGlossaryLink");

  let hasVisibleKeyTerms = false;

  function populatePageKeyTerms() {
    if (!keyTermsCard || !keyTermsList) return;
    const glossaryDataEl = document.getElementById("courseGlossaryLookupData");
    if (!glossaryDataEl) {
      keyTermsCard.classList.add("d-none");
      return;
    }

    let payload;
    try {
      payload = JSON.parse(glossaryDataEl.textContent || "{}");
    } catch (_) {
      keyTermsCard.classList.add("d-none");
      return;
    }

    const terms = Array.isArray(payload.terms) ? payload.terms : [];
    const articleText = articleEl.textContent || "";
    const matched = terms
      .filter((t) => termAppearsInText(t, articleText))
      .sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: "base" }));

    if (!matched.length) {
      keyTermsCard.classList.add("d-none");
      hasVisibleKeyTerms = false;
      return;
    }

    const baseUrl = keyTermsCard.dataset.glossaryUrl || payload.glossaryUrl || "";
    const matchedCats = Array.from(
      new Set(matched.map((t) => String(t.category || "").trim().toLowerCase()).filter(Boolean))
    );

    if (keyTermsCount) keyTermsCount.textContent = String(matched.length);
    if (keyTermsLink && baseUrl) {
      const sep = baseUrl.includes("?") ? "&" : "?";
      keyTermsLink.href = matchedCats.length
        ? `${baseUrl}${sep}categories=${encodeURIComponent(matchedCats.join(","))}`
        : baseUrl;
    }

    keyTermsList.innerHTML = "";
    matched.forEach((item, idx) => {
      const wrap = document.createElement("div");
      if (idx < matched.length - 1) wrap.className = "pb-2 border-bottom";

      const dt = document.createElement("dt");
      dt.className = "small fw-bold mb-0";

      const a = document.createElement("a");
      a.href = `${baseUrl}#term-${encodeURIComponent(item.id)}`;
      a.className = "text-decoration-none text-body";
      a.textContent = item.term;
      dt.appendChild(a);

      if (item.full) {
        const fullSpan = document.createElement("span");
        fullSpan.className = "fw-normal text-body-secondary";
        fullSpan.textContent = ` — ${item.full}`;
        dt.appendChild(fullSpan);
      }

      const dd = document.createElement("dd");
      dd.className = "small text-body-secondary mb-0 mt-1";
      dd.textContent = item.definition || "";

      wrap.appendChild(dt);
      wrap.appendChild(dd);
      keyTermsList.appendChild(wrap);
    });

    keyTermsCard.classList.remove("d-none");
    hasVisibleKeyTerms = true;
  }

  function setKeyTermsCollapsed(collapsed) {
    if (!hasVisibleKeyTerms || !keyTermsBody) return;
    if (window.bootstrap?.Collapse) {
      const inst = window.bootstrap.Collapse.getOrCreateInstance(keyTermsBody, { toggle: false });
      if (collapsed) {
        inst.hide();
      } else {
        inst.show();
      }
    } else {
      keyTermsBody.classList.toggle("show", !collapsed);
    }
    keyTermsToggle?.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }

  populatePageKeyTerms();

  // 2. Wrap article headings into collapsible sections with multi-option Bookmarks
  function isHeadingEl(node) {
    return (
      node &&
      node.nodeType === Node.ELEMENT_NODE &&
      /^H[2-4]$/.test(node.tagName)
    );
  }

  function slugify(str) {
    return String(str || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  const directChildren = Array.from(articleEl.children);
  const directHeadings = directChildren.filter(isHeadingEl);
  if (!directHeadings.length) return;

  const topLevel = Math.min(...directHeadings.map((h) => Number(h.tagName.slice(1))));
  const subLevel = topLevel < 4 ? topLevel + 1 : null;

  const usedIds = new Set();
  function assignSectionId(headingEl, idx) {
    const base = headingEl.id || slugify(headingEl.textContent) || `section-${idx + 1}`;
    let candidate = base;
    let suffix = 2;
    while (usedIds.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(candidate);
    if (!headingEl.id) headingEl.id = candidate;
    return candidate;
  }

  const ICONS = {
    outline:
      '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v13.5a.5.5 0 0 1-.777.416L8 13.101l-5.223 2.815A.5.5 0 0 1 2 15.5zm2-1a1 1 0 0 0-1 1v12.566l4.723-2.482a.5.5 0 0 1 .554 0L13 14.566V2a1 1 0 0 0-1-1z"/></svg>',
    return:
      '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" d="M1.5 1.5A.5.5 0 0 0 1 2v4.8a2.5 2.5 0 0 0 2.5 2.5h9.793l-3.347 3.346a.5.5 0 0 0 .708.708l4.2-4.2a.5.5 0 0 0 0-.708l-4-4a.5.5 0 0 0-.708.708L13.293 8.3H3.5A1.5 1.5 0 0 1 2 6.8V2a.5.5 0 0 0-.5-.5"/></svg>',
    bookmark:
      '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2v13.5a.5.5 0 0 0 .74.439L8 13.069l5.26 2.87A.5.5 0 0 0 14 15.5V2a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2"/></svg>',
    review:
      '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path d="M14.778.085A.5.5 0 0 1 15 .5V8a.5.5 0 0 1-.314.464L14.5 8l.186.464-.003.001-.006.003-.023.009a12 12 0 0 1-.397.15c-.264.095-.631.223-1.047.35-.816.252-1.879.523-2.71.523-.847 0-1.548-.28-2.158-.525l-.028-.01C7.68 8.71 7.14 8.5 6.5 8.5c-.7 0-1.638.23-2.437.477A20 20 0 0 0 3 9.342V15.5a.5.5 0 0 1-1 0V.5a.5.5 0 0 1 1 0v.282c.226-.079.496-.17.79-.26C4.606.272 5.67 0 6.5 0c.84 0 1.524.277 2.121.519l.043.018C9.286.788 9.828 1 10.5 1c.7 0 1.638-.23 2.437-.477a20 20 0 0 0 1.349-.476l.019-.007.004-.002h.001"/></svg>'
  };

  const TYPE_LABELS = {
    return: "Return to",
    bookmark: "Bookmarked",
    review: "Review later"
  };

  const allSections = [];

  function buildSectionBlock(headingEl, contentNodes, depth, parentSection = null) {
    const id = assignSectionId(headingEl, allSections.length);
    const titleText = (headingEl.textContent || "").trim();

    const wrapper = document.createElement("section");
    wrapper.className = depth === 0 ? "article-section" : "article-subsection";
    wrapper.dataset.sectionId = id;
    wrapper.dataset.sectionDepth = String(depth);

    const header = document.createElement("div");
    header.className = "article-section-header article-section-ui";

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "article-section-toggle";
    toggleBtn.setAttribute("aria-expanded", "true");

    const chevron = document.createElement("span");
    chevron.className = "article-section-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "▸";

    const titleSpan = document.createElement("span");
    titleSpan.className = "article-section-title-text";
    while (headingEl.firstChild) {
      titleSpan.appendChild(headingEl.firstChild);
    }

    toggleBtn.appendChild(chevron);
    toggleBtn.appendChild(titleSpan);

    headingEl.classList.add("article-section-heading");
    headingEl.appendChild(toggleBtn);

    const actions = document.createElement("div");
    actions.className = "article-section-actions d-print-none";

    const bookmarkPill = document.createElement("span");
    bookmarkPill.className = "article-bookmark-pill d-none";
    actions.appendChild(bookmarkPill);

    // Bookmark dropdown menu (Return to / Bookmark / Review later / Remove)
    const dropdownWrap = document.createElement("div");
    dropdownWrap.className = "dropdown";

    const bookmarkBtn = document.createElement("button");
    bookmarkBtn.type = "button";
    bookmarkBtn.className = "article-section-bookmark-btn";
    bookmarkBtn.setAttribute("data-bs-toggle", "dropdown");
    bookmarkBtn.setAttribute("aria-expanded", "false");
    bookmarkBtn.innerHTML = ICONS.outline;
    bookmarkBtn.title = `Bookmark or flag “${titleText}”`;
    bookmarkBtn.setAttribute("aria-label", `Bookmark options for ${titleText}`);

    const menu = document.createElement("ul");
    menu.className = "dropdown-menu dropdown-menu-end shadow-sm article-bookmark-menu";
    menu.innerHTML = `
      <li>
        <button type="button" class="dropdown-item small d-flex align-items-center gap-2" data-bm-action="return">
          <span class="quickref-type-return">${ICONS.return}</span>
          <span>Return to <span class="text-body-secondary">(continue here)</span></span>
        </button>
      </li>
      <li>
        <button type="button" class="dropdown-item small d-flex align-items-center gap-2" data-bm-action="bookmark">
          <span class="quickref-type-bookmark">${ICONS.bookmark}</span>
          <span>Bookmark <span class="text-body-secondary">(quick reference)</span></span>
        </button>
      </li>
      <li>
        <button type="button" class="dropdown-item small d-flex align-items-center gap-2" data-bm-action="review">
          <span class="quickref-type-review">${ICONS.review}</span>
          <span>Review later</span>
        </button>
      </li>
      <li class="d-none" data-bm-remove-divider><hr class="dropdown-divider my-1"></li>
      <li class="d-none" data-bm-remove-item>
        <button type="button" class="dropdown-item small text-danger" data-bm-action="remove">
          Remove bookmark
        </button>
      </li>
    `;

    dropdownWrap.appendChild(bookmarkBtn);
    dropdownWrap.appendChild(menu);
    actions.appendChild(dropdownWrap);

    header.appendChild(headingEl);
    header.appendChild(actions);

    const body = document.createElement("div");
    body.className = "article-section-body";
    contentNodes.forEach((node) => body.appendChild(node));

    wrapper.appendChild(header);
    wrapper.appendChild(body);

    const record = {
      id,
      title: titleText,
      depth,
      parent: parentSection,
      children: [],
      wrapper,
      header,
      body,
      toggleBtn,
      actions,
      bookmarkPill,
      bookmarkBtn,
      menu,
      collapsed: false
    };

    if (parentSection) {
      parentSection.children.push(record);
    }
    allSections.push(record);

    // Recursively group nested subsections (e.g. H3 inside H2)
    if (depth === 0 && subLevel) {
      const bodyNodes = Array.from(body.childNodes);
      const hasSubHeadings = bodyNodes.some(
        (n) => isHeadingEl(n) && Number(n.tagName.slice(1)) === subLevel
      );

      if (hasSubHeadings) {
        const frag = document.createDocumentFragment();
        let currentSubHeading = null;
        let currentSubNodes = [];

        const flushSub = () => {
          if (!currentSubHeading) return;
          const subRecord = buildSectionBlock(currentSubHeading, currentSubNodes, 1, record);
          frag.appendChild(subRecord.wrapper);
          currentSubHeading = null;
          currentSubNodes = [];
        };

        bodyNodes.forEach((node) => {
          if (isHeadingEl(node) && Number(node.tagName.slice(1)) === subLevel) {
            flushSub();
            currentSubHeading = node;
          } else if (currentSubHeading) {
            currentSubNodes.push(node);
          } else {
            frag.appendChild(node);
          }
        });
        flushSub();

        body.innerHTML = "";
        body.appendChild(frag);

        // Per-section Show · Collapse controls for its subsections
        if (record.children.length > 0) {
          const subCtrl = document.createElement("span");
          subCtrl.className = "article-sub-controls d-inline-flex align-items-center gap-1";
          subCtrl.innerHTML =
            '<button type="button" class="btn btn-link btn-sm p-0 text-decoration-none text-body-secondary article-sub-expand" style="font-size: 0.72rem;">Show</button>' +
            '<span class="text-body-tertiary" aria-hidden="true" style="font-size: 0.72rem;">·</span>' +
            '<button type="button" class="btn btn-link btn-sm p-0 text-decoration-none text-body-secondary article-sub-collapse" style="font-size: 0.72rem;">Collapse</button>';

          subCtrl.querySelector(".article-sub-expand")?.addEventListener("click", (e) => {
            e.stopPropagation();
            setSectionCollapsed(record, false);
            record.children.forEach((child) => setSectionCollapsed(child, false));
          });
          subCtrl.querySelector(".article-sub-collapse")?.addEventListener("click", (e) => {
            e.stopPropagation();
            record.children.forEach((child) => setSectionCollapsed(child, true));
          });

          actions.insertBefore(subCtrl, dropdownWrap);
        }
      }
    }

    return record;
  }

  // Group direct children into top-level collapsible sections
  const allChildNodes = Array.from(articleEl.childNodes);
  const rebuiltFrag = document.createDocumentFragment();
  let currentHeading = null;
  let currentNodes = [];

  function flushTopSection() {
    if (!currentHeading) return;
    const rec = buildSectionBlock(currentHeading, currentNodes, 0, null);
    rebuiltFrag.appendChild(rec.wrapper);
    currentHeading = null;
    currentNodes = [];
  }

  allChildNodes.forEach((node) => {
    if (isHeadingEl(node) && Number(node.tagName.slice(1)) === topLevel) {
      flushTopSection();
      currentHeading = node;
    } else if (currentHeading) {
      currentNodes.push(node);
    } else {
      rebuiltFrag.appendChild(node);
    }
  });
  flushTopSection();

  if (!allSections.length) return;

  articleEl.innerHTML = "";
  articleEl.appendChild(rebuiltFrag);

  // Build compact Article Controls Bar above #courseArticleContent
  const toolbar = document.createElement("div");
  toolbar.id = "articleSectionBar";
  toolbar.className =
    "article-section-bar article-section-ui d-flex flex-wrap align-items-center justify-content-between gap-2 px-3 py-2 mb-3 rounded border bg-body-tertiary d-print-none";
  toolbar.innerHTML = `
    <div class="d-flex flex-wrap align-items-center gap-2" id="articleBookmarkQuickBar">
      <span class="small text-body-secondary" id="articleSectionCountLabel">
        ${allSections.length} ${allSections.length === 1 ? "section" : "sections"}
      </span>
      <button type="button" class="btn btn-sm border py-0 px-2 d-none article-resume-btn" id="articleResumeBookmarkBtn" style="font-size: 0.76rem;">
        <span aria-hidden="true">↪</span> <span id="articleResumeBookmarkLabel">Return to</span>
      </button>
    </div>
    <div class="d-inline-flex align-items-center gap-2 small">
      <button type="button" class="btn btn-link btn-sm p-0 text-decoration-none text-body-secondary" id="articleShowAllBtn" style="font-size: 0.78rem;">
        Show all
      </button>
      <span class="text-body-tertiary" aria-hidden="true">·</span>
      <button type="button" class="btn btn-link btn-sm p-0 text-decoration-none text-body-secondary" id="articleCollapseAllBtn" style="font-size: 0.78rem;">
        Collapse all
      </button>
    </div>
  `;

  articleEl.parentNode.insertBefore(toolbar, articleEl);

  const resumeBtn = toolbar.querySelector("#articleResumeBookmarkBtn");
  const resumeLabelEl = toolbar.querySelector("#articleResumeBookmarkLabel");
  const showAllBtn = toolbar.querySelector("#articleShowAllBtn");
  const collapseAllBtn = toolbar.querySelector("#articleCollapseAllBtn");

  function setSectionCollapsed(sec, collapsed) {
    sec.collapsed = Boolean(collapsed);
    sec.wrapper.classList.toggle("is-collapsed", sec.collapsed);
    sec.toggleBtn.setAttribute("aria-expanded", sec.collapsed ? "false" : "true");
  }

  function jumpToSectionById(sectionId) {
    const target = allSections.find((s) => s.id === sectionId);
    if (!target) return;
    if (target.parent) setSectionCollapsed(target.parent, false);
    setSectionCollapsed(target, false);
    target.wrapper.scrollIntoView({ behavior: "smooth", block: "start" });
    target.wrapper.classList.remove("section-jump-pulse");
    void target.wrapper.offsetWidth;
    target.wrapper.classList.add("section-jump-pulse");
    window.setTimeout(() => target.wrapper.classList.remove("section-jump-pulse"), 1600);
  }

  function renderBookmarksOnPage() {
    const pageBookmarks = progressApi?.getBookmarks?.(currentUrl) || [];
    const bySection = new Map();
    pageBookmarks.forEach((bm) => bySection.set(bm.sectionId, bm));

    let returnTarget = null;

    allSections.forEach((sec) => {
      const bm = bySection.get(sec.id) || null;
      const type = bm?.type || "";

      sec.wrapper.classList.remove("bm-type-return", "bm-type-bookmark", "bm-type-review");
      if (type) {
        sec.wrapper.classList.add(`bm-type-${type}`);
      }

      if (type === "return") {
        returnTarget = sec;
      }

      if (type) {
        sec.bookmarkPill.className = `article-bookmark-pill article-bookmark-pill-${type}`;
        sec.bookmarkPill.innerHTML = `${ICONS[type] || ""} <span>${TYPE_LABELS[type] || "Bookmarked"}</span>`;
        sec.bookmarkBtn.innerHTML = ICONS[type] || ICONS.bookmark;
        sec.bookmarkBtn.classList.add("is-active");
        sec.bookmarkBtn.dataset.activeType = type;
      } else {
        sec.bookmarkPill.className = "article-bookmark-pill d-none";
        sec.bookmarkPill.innerHTML = "";
        sec.bookmarkBtn.innerHTML = ICONS.outline;
        sec.bookmarkBtn.classList.remove("is-active");
        delete sec.bookmarkBtn.dataset.activeType;
      }

      // Update active highlight & Remove item inside dropdown menu
      sec.menu.querySelectorAll("[data-bm-action]").forEach((btn) => {
        const act = btn.dataset.bmAction;
        btn.classList.toggle("active", Boolean(type && act === type));
      });
      sec.menu.querySelector("[data-bm-remove-divider]")?.classList.toggle("d-none", !type);
      sec.menu.querySelector("[data-bm-remove-item]")?.classList.toggle("d-none", !type);
    });

    if (resumeBtn && resumeLabelEl) {
      if (returnTarget) {
        resumeLabelEl.textContent = `Return to: ${returnTarget.title}`;
        resumeBtn.dataset.targetSection = returnTarget.id;
        resumeBtn.classList.remove("d-none");
      } else {
        resumeBtn.classList.add("d-none");
        delete resumeBtn.dataset.targetSection;
      }
    }
  }

  // Wire up section collapse toggles & bookmark dropdown actions
  allSections.forEach((sec) => {
    sec.toggleBtn.addEventListener("click", () => {
      setSectionCollapsed(sec, !sec.collapsed);
    });

    sec.menu.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-bm-action]");
      if (!btn || !progressApi) return;
      const action = btn.dataset.bmAction;
      const id = `${currentUrl}#${sec.id}`;

      if (action === "remove") {
        progressApi.removeBookmark(id);
      } else if (action === "return" || action === "bookmark" || action === "review") {
        const rawText = (sec.body.textContent || "").replace(/\s+/g, " ").trim();
        const snippet = rawText.length > 180 ? `${rawText.slice(0, 177).trimEnd()}…` : rawText;
        progressApi.setBookmark({
          url: currentUrl,
          pageTitle: currentPageTitle,
          sectionId: sec.id,
          sectionTitle: sec.title,
          snippet,
          type: action
        });
        if (sec.parent) setSectionCollapsed(sec.parent, false);
        setSectionCollapsed(sec, false);
      }
    });
  });

  showAllBtn?.addEventListener("click", () => {
    allSections.forEach((s) => setSectionCollapsed(s, false));
    setKeyTermsCollapsed(false);
  });

  collapseAllBtn?.addEventListener("click", () => {
    allSections.forEach((s) => setSectionCollapsed(s, true));
    setKeyTermsCollapsed(true);
  });

  resumeBtn?.addEventListener("click", () => {
    const secId = resumeBtn.dataset.targetSection;
    if (secId) jumpToSectionById(secId);
  });

  window.addEventListener("shynotes:bookmarks-changed", renderBookmarksOnPage);
  window.addEventListener("shynotes:jump-to-section", (event) => {
    const secId = event.detail?.sectionId;
    if (secId) jumpToSectionById(secId);
  });

  // On page load: render bookmarks, auto-collapse sections ABOVE a "Return to" bookmark, and honor URL #hash
  renderBookmarksOnPage();

  const pageBookmarks = progressApi?.getBookmarks?.(currentUrl) || [];
  const returnBm = pageBookmarks.find((b) => b.type === "return");
  if (returnBm) {
    const returnIdx = allSections.findIndex((s) => s.id === returnBm.sectionId);
    if (returnIdx > 0) {
      const returnSec = allSections[returnIdx];
      for (let i = 0; i < returnIdx; i += 1) {
        const sec = allSections[i];
        // Never collapse the parent containing the Return to section
        if (returnSec.parent && sec === returnSec.parent) continue;
        setSectionCollapsed(sec, true);
      }
    }
  }

  if (window.location.hash && window.location.hash.length > 1) {
    const hashId = decodeURIComponent(window.location.hash.slice(1));
    const hashSec = allSections.find((s) => s.id === hashId);
    if (hashSec) {
      window.setTimeout(() => jumpToSectionById(hashId), 60);
    }
  }
})();
