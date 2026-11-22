(() => {
  const sidebar = document.getElementById("contentPrintSidebar");
  const workspace = document.getElementById("contentPrintWorkspace");
  if (!sidebar || !workspace) return;

  const isPrintMode = document.documentElement.classList.contains("print-mode");
  if (!isPrintMode) return;
  if (
    document.documentElement.classList.contains("course-view-glossary") ||
    document.documentElement.classList.contains("course-view-quickref") ||
    document.documentElement.classList.contains("course-view-mindmap")
  ) {
    return;
  }

  const courseSlug = sidebar.dataset.courseSlug || "default";
  const STORAGE_KEY = `shynotes.content.print.v1.${courseSlug}`;
  const currentUrl = sidebar.dataset.currentUrl || window.location.pathname;
  const currentTitle = sidebar.dataset.currentTitle || document.title;
  const scopeLabel = sidebar.dataset.scopeLabel || "";
  const isCourseRoot = sidebar.dataset.isCourseRoot === "true";
  const pageTags = (sidebar.dataset.pageTags || "").split("|").filter(Boolean);
  const sectionTags = (sidebar.dataset.sectionTags || "").split("|").filter(Boolean);
  const defaultScope = sidebar.dataset.defaultScope === "section" ? "section" : "page";

  const printHeaderEl = document.getElementById("contentPrintHeader");
  const printSheetEl = document.getElementById("contentPrintSheet");
  const printTitleEl = document.getElementById("contentPrintTitle");
  const printSubtitleEl = document.getElementById("contentPrintSubtitle");
  const singleArticleEl = document.getElementById("courseArticleContent");
  const compiledEl = document.getElementById("contentPrintCompiled");
  const glossaryAppendixEl = document.getElementById("contentPrintGlossary");
  const glossaryOptWrap = document.getElementById("contentPrintGlossaryWrap");
  const termStyleWrap = document.getElementById("contentPrintTermStyleWrap");
  const termThicknessWrap = document.getElementById("contentPrintTermThicknessWrap");
  const termColorWrap = document.getElementById("contentPrintTermColorWrap");
  const termColorSwatches = Array.from(document.querySelectorAll(".term-color-swatch"));
  const glossaryCountEl = document.getElementById("contentPrintGlossaryCount");
  const pagePickerEl = document.getElementById("contentPrintPagePicker");
  const pageBreaksWrap = document.getElementById("contentPrintPageBreaksWrap");
  const selectAllBtn = document.getElementById("contentPrintSelectAllBtn");
  const loadingEl = document.getElementById("contentPrintLoading");
  const printNowBtn = document.getElementById("contentPreviewPrintBtn");
  const fabPrintBtn = document.getElementById("contentFabPrintBtn");
  const printResetBtn = document.getElementById("contentPrintResetBtn");
  const printFontFamilySelect = document.getElementById("contentPrintFontFamily");

  const scopeRadios = Array.from(document.querySelectorAll('input[name="contentPrintScope"]'));
  const pageCheckboxes = Array.from(document.querySelectorAll(".content-print-page-cb"));
  const optCheckboxes = Array.from(document.querySelectorAll(".content-print-opt"));
  const optSelects = Array.from(document.querySelectorAll(".content-print-select"));

  let manifest = [];
  const manifestEl = document.getElementById("coursePrintSectionManifest");
  if (manifestEl) {
    try {
      const parsed = JSON.parse(manifestEl.textContent || "[]");
      if (Array.isArray(parsed)) manifest = parsed;
    } catch (_) {
      manifest = [];
    }
  }

  let allGlossaryTerms = [];
  const glossaryDataEl = document.getElementById("courseGlossaryLookupData");
  if (glossaryDataEl) {
    try {
      const parsed = JSON.parse(glossaryDataEl.textContent || "{}");
      if (Array.isArray(parsed.terms)) {
        allGlossaryTerms = parsed.terms
          .filter((t) => t && t.term)
          .sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: "base" }));
      }
    } catch (_) {
      allGlossaryTerms = [];
    }
  }

  if (!allGlossaryTerms.length) {
    glossaryOptWrap?.classList.add("d-none");
    termStyleWrap?.classList.add("d-none");
  }

  const SKIP_MARK_TAGS = new Set([
    "A",
    "BUTTON",
    "CODE",
    "PRE",
    "SCRIPT",
    "STYLE",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6"
  ]);

  function annotateTermsInContainer(container, terms) {
    if (!container || !terms.length) return;

    const entries = [];
    terms.forEach((item) => {
      if (!item || !item.term) return;
      const phrases = [item.term];
      if (Array.isArray(item.aliases)) {
        item.aliases.forEach((a) => {
          if (typeof a === "string" && a.trim().length >= 2) phrases.push(a.trim());
        });
      }
      phrases.forEach((p) => {
        const clean = p.trim();
        if (clean.length >= 2) {
          entries.push({ phrase: clean, caseSensitive: isAcronym(clean), id: item.id || item.term });
        }
      });
    });
    entries.sort((a, b) => b.phrase.length - a.phrase.length);

    function shouldSkip(node) {
      let parent = node.parentElement;
      while (parent && parent !== container) {
        if (SKIP_MARK_TAGS.has(parent.tagName)) return true;
        if (parent.classList.contains("content-print-term-mark")) return true;
        parent = parent.parentElement;
      }
      return false;
    }

    const markedIds = new Set();
    entries.forEach((entry) => {
      if (markedIds.has(entry.id)) return;
      const flags = entry.caseSensitive ? "" : "i";
      const rx = new RegExp(`\\b(${escapeRegex(entry.phrase)})\\b`, flags);

      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
      let textNode;
      while ((textNode = walker.nextNode())) {
        if (!textNode.nodeValue || !textNode.nodeValue.trim()) continue;
        if (shouldSkip(textNode)) continue;

        const match = rx.exec(textNode.nodeValue);
        if (!match) continue;

        const before = textNode.nodeValue.slice(0, match.index);
        const matched = match[1];
        const after = textNode.nodeValue.slice(match.index + matched.length);

        const span = document.createElement("span");
        span.className = "content-print-term-mark";
        span.textContent = matched;

        const frag = document.createDocumentFragment();
        if (before) frag.appendChild(document.createTextNode(before));
        frag.appendChild(span);
        if (after) frag.appendChild(document.createTextNode(after));

        textNode.parentNode.replaceChild(frag, textNode);
        markedIds.add(entry.id);
        break;
      }
    });
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function isAcronym(phrase) {
    return phrase.length <= 6 && phrase === phrase.toUpperCase() && /[A-Z]/.test(phrase);
  }

  function termAppearsInText(termObj, text) {
    if (!text) return false;
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

  function termMatchesTags(termObj, tagList) {
    if (!tagList.length) return false;
    const cat = (termObj.category || "").toLowerCase();
    if (cat && tagList.includes(cat)) return true;
    if (Array.isArray(termObj.tags)) {
      return termObj.tags.some((t) => tagList.includes(String(t || "").toLowerCase()));
    }
    return false;
  }

  function renderGlossaryAppendix(renderedText) {
    if (!glossaryAppendixEl) return;
    if (!allGlossaryTerms.length) {
      glossaryAppendixEl.classList.add("d-none");
      glossaryAppendixEl.innerHTML = "";
      return;
    }

    const isSectionScope = opts.scope === "section" && manifest.length > 1;
    let relevantTerms = [];
    let headingText = "Glossary";

    if (isCourseRoot && isSectionScope) {
      // Entire course: include the full course glossary at the back
      relevantTerms = allGlossaryTerms;
      headingText = "Glossary";
    } else if (isSectionScope) {
      // Single section: terms matching section tags OR mentioned in any selected page of the section
      relevantTerms = allGlossaryTerms.filter(
        (t) => termMatchesTags(t, sectionTags) || termAppearsInText(t, renderedText)
      );
      headingText = scopeLabel ? `Glossary — ${scopeLabel}` : "Glossary";
    } else {
      // Single page: terms mentioned on this page (or matching tags explicitly set on this page)
      relevantTerms = allGlossaryTerms.filter(
        (t) => termAppearsInText(t, renderedText) || termMatchesTags(t, pageTags)
      );
      headingText = "Key Terms";
    }

    if (glossaryCountEl) {
      glossaryCountEl.textContent = `(${relevantTerms.length})`;
    }

    if (glossaryOptWrap) {
      glossaryOptWrap.classList.toggle("d-none", relevantTerms.length === 0);
    }
    if (termStyleWrap) {
      const showPanel = relevantTerms.length > 0 && opts.includeGlossary;
      termStyleWrap.classList.toggle("d-none", !showPanel);
      termStyleWrap.classList.toggle("d-flex", showPanel);
    }

    if (!relevantTerms.length) {
      glossaryAppendixEl.classList.add("d-none");
      glossaryAppendixEl.innerHTML = "";
      return relevantTerms;
    }

    glossaryAppendixEl.innerHTML = "";
    const heading = document.createElement("h2");
    heading.className = "content-print-glossary-heading";
    heading.textContent = headingText;
    glossaryAppendixEl.appendChild(heading);

    relevantTerms.forEach((item) => {
      const p = document.createElement("p");
      p.className = "content-print-glossary-item";

      const termSpan = document.createElement("span");
      termSpan.className = "content-print-glossary-term";
      termSpan.textContent = item.term;
      p.appendChild(termSpan);

      if (item.full) {
        const fullSpan = document.createElement("span");
        fullSpan.className = "content-print-glossary-full";
        fullSpan.textContent = ` — ${item.full}`;
        p.appendChild(fullSpan);
      }

      p.appendChild(document.createTextNode(`: ${item.definition || ""}`));
      glossaryAppendixEl.appendChild(p);
    });

    glossaryAppendixEl.classList.remove("d-none");
    return relevantTerms;
  }

  function readSaved() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function writeSaved(prefs) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (_) {
      // Ignore storage errors
    }
  }

  const saved = readSaved() || {};
  const validFonts = ["sm", "md", "lg"];
  const validSpacings = ["compact", "normal", "relaxed"];
  const validTermStyles = ["dotted", "solid", "box", "highlight", "bold", "none"];
  const validTermThicknesses = ["thin", "medium", "thick"];
  const validTermColors = ["ink", "yellow", "blue", "green", "pink"];

  const urlParams = new URLSearchParams(window.location.search);
  const urlScope = urlParams.get("scope");

  function getDefaultOpts() {
    return {
      scope: manifest.length > 1 ? defaultScope : "page",
      pageBreaks: false,
      includeGlossary: true,
      termStyle: "dotted",
      termThickness: "thin",
      termColor: "ink",
      showHeader: true,
      font: "md",
      fontFamily: "",
      spacing: "normal"
    };
  }

  const defaults = getDefaultOpts();
  const opts = {
    scope:
      manifest.length > 1
        ? urlScope === "section" || urlScope === "page"
          ? urlScope
          : defaultScope
        : "page",
    pageBreaks: Boolean(saved.pageBreaks),
    includeGlossary: saved.includeGlossary !== undefined ? Boolean(saved.includeGlossary) : defaults.includeGlossary,
    termStyle: validTermStyles.includes(saved.termStyle) ? saved.termStyle : defaults.termStyle,
    termThickness: validTermThicknesses.includes(saved.termThickness) ? saved.termThickness : defaults.termThickness,
    termColor: validTermColors.includes(saved.termColor) ? saved.termColor : defaults.termColor,
    showHeader: saved.showHeader !== undefined ? Boolean(saved.showHeader) : defaults.showHeader,
    font: validFonts.includes(saved.font) ? saved.font : defaults.font,
    fontFamily: typeof saved.fontFamily === "string" ? saved.fontFamily : "",
    spacing: validSpacings.includes(saved.spacing) ? saved.spacing : defaults.spacing
  };

  function getEffectivePrintFontFamily() {
    // Only inherit the website font when the user hasn't picked a print-specific font
    if (opts.fontFamily) {
      return opts.fontFamily;
    }
    return window.ShyNotesDisplay?.get?.().font || "sans";
  }

  function applyPrintSheetFontFamily() {
    const webFont = window.ShyNotesDisplay?.get?.().font || "sans";
    const chosenKey = getEffectivePrintFontFamily();

    if (printSheetEl && window.ShyNotesDisplay?.resolveFontFamily) {
      printSheetEl.style.setProperty(
        "--print-sheet-font",
        window.ShyNotesDisplay.resolveFontFamily(chosenKey)
      );
    }

    if (printFontFamilySelect) {
      const siteOpt = printFontFamilySelect.querySelector("option[data-site-font-option]");
      if (siteOpt) {
        const label = window.ShyNotesDisplay?.getFontLabel?.(webFont) || "Sans-Serif";
        siteOpt.textContent = `Match website font (${label})`;
      }

      if (opts.fontFamily && opts.fontFamily.startsWith("system:")) {
        const group = printFontFamilySelect.querySelector(".a11y-system-fonts-group");
        if (group && !Array.from(group.children).some((o) => o.value === opts.fontFamily)) {
          const opt = document.createElement("option");
          opt.value = opts.fontFamily;
          opt.textContent = opts.fontFamily.slice("system:".length);
          group.appendChild(opt);
          group.classList.remove("d-none");
        }
      }

      printFontFamilySelect.value = opts.fontFamily || "";
    }
  }

  // Cache fetched page HTML fragments keyed by URL
  const fetchedHtmlCache = new Map();
  if (singleArticleEl) {
    fetchedHtmlCache.set(currentUrl, singleArticleEl.innerHTML);
  }

  async function fetchPageArticleHtml(url) {
    if (fetchedHtmlCache.has(url)) {
      return fetchedHtmlCache.get(url);
    }
    try {
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const doc = new window.DOMParser().parseFromString(html, "text/html");
      const article = doc.getElementById("courseArticleContent");
      const content = article ? article.innerHTML : '<p class="text-muted">No content available.</p>';
      fetchedHtmlCache.set(url, content);
      return content;
    } catch (_) {
      return '<p class="text-muted">Could not load this page.</p>';
    }
  }

  function applyVisualOptions(shouldSave = true) {
    validFonts.forEach((f) => workspace.classList.toggle(`content-font-${f}`, f === opts.font));
    validSpacings.forEach((s) => workspace.classList.toggle(`content-space-${s}`, s === opts.spacing));
    validTermStyles.forEach((st) => workspace.classList.toggle(`term-style-${st}`, st === opts.termStyle));
    validTermThicknesses.forEach((th) => workspace.classList.toggle(`term-thick-${th}`, th === opts.termThickness));
    validTermColors.forEach((col) => workspace.classList.toggle(`term-color-${col}`, col === opts.termColor));

    workspace.classList.toggle("content-page-breaks", Boolean(opts.pageBreaks) && opts.scope === "section");
    workspace.classList.toggle("content-hide-header", !opts.showHeader);
    workspace.classList.toggle("content-hide-glossary", !opts.includeGlossary);

    if (termStyleWrap && !glossaryOptWrap?.classList.contains("d-none")) {
      termStyleWrap.classList.toggle("d-none", !opts.includeGlossary);
      termStyleWrap.classList.toggle("d-flex", opts.includeGlossary);
    }

    const usesThickness = ["dotted", "solid", "box"].includes(opts.termStyle);
    const usesColor = opts.termStyle !== "none";
    termThicknessWrap?.classList.toggle("d-none", !usesThickness);
    termColorWrap?.classList.toggle("d-none", !usesColor);

    termColorSwatches.forEach((btn) => {
      const isSelected = btn.dataset.termColor === opts.termColor;
      btn.classList.toggle("active", isSelected);
      btn.setAttribute("aria-checked", isSelected ? "true" : "false");
    });

    const isSection = opts.scope === "section" && manifest.length > 1;
    pagePickerEl?.classList.toggle("d-none", !isSection);
    pageBreaksWrap?.classList.toggle("d-none", !isSection);

    scopeRadios.forEach((r) => {
      r.checked = r.value === opts.scope;
      r.closest(".content-scope-option")?.classList.toggle("active", r.checked);
    });

    optCheckboxes.forEach((cb) => {
      const key = cb.dataset.contentOpt;
      if (key) cb.checked = Boolean(opts[key]);
    });

    optSelects.forEach((sel) => {
      const key = sel.dataset.contentSelect;
      if (key && opts[key]) sel.value = opts[key];
    });

    if (shouldSave) {
      writeSaved({
        pageBreaks: opts.pageBreaks,
        includeGlossary: opts.includeGlossary,
        termStyle: opts.termStyle,
        termThickness: opts.termThickness,
        termColor: opts.termColor,
        showHeader: opts.showHeader,
        font: opts.font,
        fontFamily: opts.fontFamily,
        spacing: opts.spacing
      });
    }
  }

  let renderToken = 0;

  async function renderScopeContent() {
    const token = ++renderToken;
    const isSection = opts.scope === "section" && manifest.length > 1;

    if (!isSection) {
      singleArticleEl?.classList.remove("d-none");
      compiledEl?.classList.add("d-none");
      if (compiledEl) compiledEl.innerHTML = "";
      loadingEl?.classList.add("d-none");

      if (printTitleEl) printTitleEl.textContent = currentTitle;
      if (printSubtitleEl) {
        printSubtitleEl.textContent = printHeaderEl?.dataset.pageDescription || "";
        printSubtitleEl.classList.toggle("d-none", !printSubtitleEl.textContent.trim());
      }

      const relevantTerms = renderGlossaryAppendix(singleArticleEl?.textContent || "") || [];
      if (singleArticleEl && !singleArticleEl.dataset.termsAnnotated && relevantTerms.length) {
        annotateTermsInContainer(singleArticleEl, relevantTerms);
        singleArticleEl.dataset.termsAnnotated = "true";
      }
      return;
    }

    const selectedUrls = new Set(
      pageCheckboxes.filter((cb) => cb.checked).map((cb) => cb.value)
    );
    const chosenDocs = manifest.filter((doc) => selectedUrls.has(doc.url));

    if (printTitleEl) printTitleEl.textContent = scopeLabel || currentTitle;
    if (printSubtitleEl) {
      printSubtitleEl.textContent = "";
      printSubtitleEl.classList.add("d-none");
    }

    if (!chosenDocs.length) {
      singleArticleEl?.classList.add("d-none");
      compiledEl?.classList.remove("d-none");
      if (compiledEl) {
        compiledEl.innerHTML = '<p class="text-secondary small">Select at least one topic from the sidebar to preview.</p>';
      }
      renderGlossaryAppendix("");
      return;
    }

    loadingEl?.classList.remove("d-none");
    const htmlList = await Promise.all(chosenDocs.map((doc) => fetchPageArticleHtml(doc.url)));
    if (token !== renderToken) return;
    loadingEl?.classList.add("d-none");

    singleArticleEl?.classList.add("d-none");
    if (compiledEl) {
      compiledEl.innerHTML = "";
      chosenDocs.forEach((doc, idx) => {
        const sec = document.createElement("section");
        sec.className = "content-print-doc";

        const skipHeading = doc.isScopeIndex && doc.title === scopeLabel;
        if (!skipHeading) {
          const h2 = document.createElement("h2");
          h2.className = "content-print-doc-title";
          h2.textContent = doc.title;
          sec.appendChild(h2);
        }

        const body = document.createElement("div");
        body.className = "content-print-doc-body";
        body.innerHTML = htmlList[idx];
        sec.appendChild(body);

        compiledEl.appendChild(sec);
      });
      compiledEl.classList.remove("d-none");
      const relevantTerms = renderGlossaryAppendix(compiledEl.textContent || "") || [];
      if (relevantTerms.length) {
        annotateTermsInContainer(compiledEl, relevantTerms);
      }
    }
  }

  scopeRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      opts.scope = radio.value;
      applyVisualOptions(false);
      renderScopeContent();
    });
  });

  pageCheckboxes.forEach((cb) => {
    cb.addEventListener("change", () => {
      renderScopeContent();
    });
  });

  selectAllBtn?.addEventListener("click", () => {
    pageCheckboxes.forEach((cb) => {
      cb.checked = true;
    });
    renderScopeContent();
  });

  optCheckboxes.forEach((cb) => {
    cb.addEventListener("change", () => {
      const key = cb.dataset.contentOpt;
      if (!key) return;
      opts[key] = cb.checked;
      applyVisualOptions(true);
    });
  });

  optSelects.forEach((sel) => {
    sel.addEventListener("change", () => {
      const key = sel.dataset.contentSelect;
      if (!key) return;
      opts[key] = sel.value;
      // Default highlight style to yellow if user switches from default ink to highlight
      if (key === "termStyle" && sel.value === "highlight" && opts.termColor === "ink") {
        opts.termColor = "yellow";
      }
      applyVisualOptions(true);
    });
  });

  termColorSwatches.forEach((btn) => {
    btn.addEventListener("click", () => {
      const color = btn.dataset.termColor;
      if (!color || !validTermColors.includes(color)) return;
      opts.termColor = color;
      applyVisualOptions(true);
    });
  });

  [printNowBtn, fabPrintBtn].forEach((btn) => {
    btn?.addEventListener("click", () => window.print());
  });

  printFontFamilySelect?.addEventListener("change", () => {
    opts.fontFamily = printFontFamilySelect.value || "";
    applyVisualOptions(true);
    applyPrintSheetFontFamily();
  });

  printResetBtn?.addEventListener("click", () => {
    Object.assign(opts, getDefaultOpts());
    pageCheckboxes.forEach((cb) => {
      cb.checked = true;
    });
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      // Ignore storage errors
    }
    window.history.replaceState(null, "", `${window.location.pathname}?print=1`);
    applyVisualOptions(false);
    applyPrintSheetFontFamily();
    renderScopeContent();
  });

  window.addEventListener("shynotes:system-fonts-ready", applyPrintSheetFontFamily);
  window.addEventListener("shynotes:display-change", applyPrintSheetFontFamily);

  applyVisualOptions(false);
  applyPrintSheetFontFamily();
  renderScopeContent();
})();
