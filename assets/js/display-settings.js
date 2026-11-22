(() => {
  const api = window.ShyNotesDisplay;
  if (!api) return;

  const LOCAL_FONTS_CACHE_KEY = "shynotes.display.localfonts.v1";
  const CUSTOM_FONTS_KEY = "shynotes.display.customfonts.v1";

  const COMMON_OS_FONTS = [
    "Arial",
    "Avenir Next",
    "Baskerville",
    "Calibri",
    "Cambria",
    "Charter",
    "Comic Sans MS",
    "Courier New",
    "Geneva",
    "Helvetica Neue",
    "Lucida Grande",
    "Menlo",
    "Optima",
    "Palatino",
    "Segoe UI",
    "Tahoma",
    "Times New Roman",
    "Trebuchet MS",
    "Verdana"
  ];

  const prefSelects = Array.from(document.querySelectorAll(".display-pref-select"));
  const prefSwitches = Array.from(document.querySelectorAll(".display-pref-switch"));
  const comboGroups = Array.from(document.querySelectorAll(".a11y-combo[data-combo-key]"));
  const guideColorSwatches = Array.from(document.querySelectorAll(".guide-color-swatch"));
  const guideOptionsWrap = document.getElementById("displayReadingGuideOptions");
  const guideHeightWrap = document.getElementById("displayGuideHeightWrap");
  const guideOpacityWrap = document.getElementById("displayGuideOpacityWrap");
  const guideColorWrap = document.getElementById("displayGuideColorWrap");
  const magOptionsWrap = document.getElementById("displayMagnifierOptions");
  const magShapeWrap = document.getElementById("displayMagShapeWrap");
  const systemFontGroups = Array.from(document.querySelectorAll(".a11y-system-fonts-group"));
  const resetBtn = document.getElementById("displaySettingsResetBtn");
  const loadAllFontsBtn = document.getElementById("displayLoadAllFontsBtn");
  const toggleCustomFontBtn = document.getElementById("displayToggleCustomFontBtn");
  const customFontRow = document.getElementById("displayCustomFontRow");
  const customFontInput = document.getElementById("displayCustomFontInput");
  const applyCustomFontBtn = document.getElementById("displayApplyCustomFontBtn");
  const fontStatusMsg = document.getElementById("displayFontStatusMsg");

  function readJsonList(key) {
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string" && s.trim()) : [];
    } catch (_) {
      return [];
    }
  }

  function writeJsonList(key, list) {
    try {
      window.localStorage.setItem(key, JSON.stringify(list));
    } catch (_) {
      // Ignore storage errors
    }
  }

  function detectAvailableCommonFonts() {
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return [];

      const sample = "mmmmmmmmmmlliWW01";
      const size = "72px";
      const bases = ["monospace", "sans-serif", "serif"];
      const baseWidths = {};
      bases.forEach((b) => {
        ctx.font = `${size} ${b}`;
        baseWidths[b] = ctx.measureText(sample).width;
      });

      return COMMON_OS_FONTS.filter((family) =>
        bases.some((b) => {
          ctx.font = `${size} "${family}", ${b}`;
          return Math.abs(ctx.measureText(sample).width - baseWidths[b]) > 0.5;
        })
      );
    } catch (_) {
      return [];
    }
  }

  function populateSystemFontGroups(fontNames) {
    const uniqueSorted = Array.from(new Set(fontNames.map((n) => n.trim()).filter(Boolean))).sort(
      (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })
    );

    systemFontGroups.forEach((group) => {
      group.innerHTML = "";
      if (!uniqueSorted.length) {
        group.classList.add("d-none");
        return;
      }
      group.classList.remove("d-none");
      uniqueSorted.forEach((family) => {
        const opt = document.createElement("option");
        opt.value = `system:${family}`;
        opt.textContent = family;
        group.appendChild(opt);
      });
    });
  }

  function getMergedSystemFonts() {
    const cachedFull = readJsonList(LOCAL_FONTS_CACHE_KEY);
    const customSaved = readJsonList(CUSTOM_FONTS_KEY);
    const current = api.get().font || "";
    const activeCustom = current.startsWith("system:") ? [current.slice("system:".length)] : [];

    if (cachedFull.length > 0) {
      return [...cachedFull, ...customSaved, ...activeCustom];
    }
    return [...detectAvailableCommonFonts(), ...customSaved, ...activeCustom];
  }

  function setStatus(message) {
    if (!fontStatusMsg) return;
    fontStatusMsg.textContent = message || "";
    fontStatusMsg.classList.toggle("d-none", !message);
  }

  const LEGACY_TOKEN_VALUES = {
    paragraphSpacing: { wide: "1.5em", xwide: "2.25em" },
    readingGuideHeight: { sm: "28px", md: "42px", lg: "68px", xl: "100px" },
    readingGuideOpacity: { light: "25%", medium: "45%", strong: "75%" },
    magnifierSize: { sm: "260px", md: "360px", lg: "480px" }
  };

  function normalizeComboValue(key, storedVal) {
    const str = String(storedVal ?? "");
    return LEGACY_TOKEN_VALUES[key]?.[str] || str;
  }

  function storedToComboInput(group, storedVal) {
    const key = group.dataset.comboKey;
    const mode = group.dataset.comboMode;
    const emptyVal = group.dataset.emptyVal;
    const norm = normalizeComboValue(key, storedVal);
    if (emptyVal && norm === emptyVal) return "";
    if (mode === "percent-scale") {
      const n = parseFloat(norm);
      return Number.isFinite(n) ? String(Math.round(n * 100)) : "";
    }
    const n = parseFloat(norm);
    return Number.isFinite(n) ? String(n) : "";
  }

  function comboInputToStored(group, rawStr) {
    const mode = group.dataset.comboMode;
    const emptyVal = group.dataset.emptyVal;
    const zeroIsEmpty = group.dataset.zeroIsEmpty === "true";
    const trimmed = String(rawStr || "").trim();
    if (!trimmed) {
      return emptyVal || null;
    }
    let n = Number(trimmed);
    if (!Number.isFinite(n)) return null;
    const min = Number(group.dataset.min);
    const max = Number(group.dataset.max);
    if (Number.isFinite(min)) n = Math.max(min, n);
    if (Number.isFinite(max)) n = Math.min(max, n);
    if (zeroIsEmpty && n === 0 && emptyVal) return emptyVal;

    if (mode === "percent-scale") {
      return String(Math.round(n) / 100);
    }
    if (mode === "unit") {
      const unit = group.dataset.unit || "";
      const rounded = Math.round(n * 100) / 100;
      return `${rounded}${unit}`;
    }
    return String(Math.round(n * 100) / 100);
  }

  function syncControls(prefs) {
    // Ensure currently selected custom system font is present in the dropdown before setting value
    if (prefs.font && prefs.font.startsWith("system:")) {
      const name = prefs.font.slice("system:".length);
      const exists = systemFontGroups.some((g) =>
        Array.from(g.options || g.children).some((o) => o.value === prefs.font)
      );
      if (name && !exists) {
        populateSystemFontGroups([...getMergedSystemFonts(), name]);
      }
    }

    prefSelects.forEach((sel) => {
      const key = sel.dataset.displayKey;
      if (key && prefs[key] !== undefined) {
        sel.value = String(prefs[key]);
      }
    });

    comboGroups.forEach((group) => {
      const key = group.dataset.comboKey;
      if (!key || prefs[key] === undefined) return;
      const norm = normalizeComboValue(key, prefs[key]);
      const input = group.querySelector(".a11y-combo-input");
      if (input && document.activeElement !== input) {
        input.value = storedToComboInput(group, norm);
      }
      group.querySelectorAll("[data-preset-val]").forEach((btn) => {
        const presetNorm = normalizeComboValue(key, btn.dataset.presetVal);
        btn.classList.toggle("active", presetNorm === norm);
      });
    });

    prefSwitches.forEach((sw) => {
      const key = sw.dataset.displayKey;
      if (key) {
        sw.checked = Boolean(prefs[key]);
      }
    });

    const guideOn = Boolean(prefs.readingGuide);
    const guideStyle = prefs.readingGuideStyle || "highlight";
    const guideColor = prefs.readingGuideColor || "blue";
    if (guideOptionsWrap) {
      guideOptionsWrap.classList.toggle("d-none", !guideOn);
      guideOptionsWrap.classList.toggle("d-flex", guideOn);
    }
    guideHeightWrap?.classList.toggle("d-none", guideStyle === "underline");
    guideOpacityWrap?.classList.toggle("d-none", guideStyle === "invert");
    guideColorWrap?.classList.toggle("d-none", guideStyle === "invert");
    guideColorSwatches.forEach((btn) => {
      const isSelected = btn.dataset.guideColor === guideColor;
      btn.classList.toggle("active", isSelected);
      btn.setAttribute("aria-checked", isSelected ? "true" : "false");
    });

    const magOn = Boolean(prefs.magnifier);
    const magMode = prefs.magnifierMode || "lens";
    if (magOptionsWrap) {
      magOptionsWrap.classList.toggle("d-none", !magOn);
      magOptionsWrap.classList.toggle("d-flex", magOn);
    }
    magShapeWrap?.classList.toggle("d-none", magMode === "docked");
  }

  // Show Chromium Local Font Access button if supported by browser
  if (typeof window.queryLocalFonts === "function" && loadAllFontsBtn) {
    loadAllFontsBtn.classList.remove("d-none");
    loadAllFontsBtn.addEventListener("click", async () => {
      try {
        setStatus("Requesting permission to list installed fonts…");
        const fonts = await window.queryLocalFonts();
        const families = Array.from(
          new Set(fonts.map((f) => f.family).filter((name) => name && !name.startsWith(".")))
        ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

        if (families.length) {
          writeJsonList(LOCAL_FONTS_CACHE_KEY, families);
          populateSystemFontGroups(getMergedSystemFonts());
          syncControls(api.get());
          setStatus(`Loaded ${families.length} installed system fonts.`);
        } else {
          setStatus("No local fonts were returned by the browser.");
        }
      } catch (_) {
        setStatus("Permission declined—using detected common system fonts instead.");
      }
    });
  }

  toggleCustomFontBtn?.addEventListener("click", () => {
    if (!customFontRow) return;
    const isHidden = customFontRow.classList.contains("d-none");
    customFontRow.classList.toggle("d-none", !isHidden);
    customFontRow.classList.toggle("d-flex", isHidden);
    if (isHidden) customFontInput?.focus();
  });

  function applyTypedCustomFont() {
    const raw = (customFontInput?.value || "").replace(/["'\\;{}]/g, "").trim();
    if (!raw) return;
    const savedCustom = readJsonList(CUSTOM_FONTS_KEY);
    if (!savedCustom.some((f) => f.toLowerCase() === raw.toLowerCase())) {
      savedCustom.push(raw);
      writeJsonList(CUSTOM_FONTS_KEY, savedCustom);
    }
    populateSystemFontGroups(getMergedSystemFonts());
    api.update({ font: `system:${raw}` });
    setStatus(`Applied installed font “${raw}”.`);
    if (customFontInput) customFontInput.value = "";
  }

  applyCustomFontBtn?.addEventListener("click", applyTypedCustomFont);
  customFontInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyTypedCustomFont();
    }
  });

  prefSelects.forEach((sel) => {
    sel.addEventListener("change", () => {
      const key = sel.dataset.displayKey;
      if (key) api.update({ [key]: sel.value });
    });
  });

  comboGroups.forEach((group) => {
    const key = group.dataset.comboKey;
    const input = group.querySelector(".a11y-combo-input");
    if (!key || !input) return;

    const commitInput = (normalizeField = false) => {
      const stored = comboInputToStored(group, input.value);
      if (stored !== null) {
        api.update({ [key]: stored });
        if (normalizeField) {
          input.value = storedToComboInput(group, stored);
        }
      } else if (normalizeField) {
        input.value = storedToComboInput(group, api.get()[key]);
      }
    };

    input.addEventListener("input", () => commitInput(false));
    input.addEventListener("change", () => commitInput(true));

    group.querySelectorAll("[data-preset-val]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.presetVal;
        if (val === undefined) return;
        input.value = storedToComboInput(group, val);
        api.update({ [key]: val });
      });
    });
  });

  prefSwitches.forEach((sw) => {
    sw.addEventListener("change", () => {
      const key = sw.dataset.displayKey;
      if (key) api.update({ [key]: sw.checked });
    });
  });

  guideColorSwatches.forEach((btn) => {
    btn.addEventListener("click", () => {
      const color = btn.dataset.guideColor;
      if (color) api.update({ readingGuideColor: color });
    });
  });

  resetBtn?.addEventListener("click", () => {
    setStatus("");
    api.reset();
  });

  // Lossless Sentence case text-node transformer (CSS lacks true multi-sentence sentence-case)
  const originalTextMap = new WeakMap();
  const touchedTextNodes = new Set();
  const CASE_SKIP_TAGS = new Set([
    "CODE",
    "PRE",
    "KBD",
    "SAMP",
    "SCRIPT",
    "STYLE",
    "INPUT",
    "TEXTAREA",
    "SELECT",
    "OPTION",
    "SVG"
  ]);
  let sentenceCaseActive = false;
  let sentenceObserver = null;
  let sentenceReapplyTimer = null;

  function shouldSkipCaseNode(node, root) {
    let parent = node.parentElement;
    while (parent && parent !== root) {
      if (CASE_SKIP_TAGS.has(parent.tagName)) return true;
      parent = parent.parentElement;
    }
    return false;
  }

  const BLOCK_TAGS = new Set([
    "P",
    "DIV",
    "LI",
    "TD",
    "TH",
    "DT",
    "DD",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "BLOCKQUOTE",
    "SECTION",
    "ARTICLE",
    "HEADER",
    "FOOTER",
    "ASIDE",
    "NAV",
    "BUTTON",
    "A"
  ]);

  function getClosestBlock(node, root) {
    let el = node.parentElement;
    while (el && el !== root) {
      if (BLOCK_TAGS.has(el.tagName)) return el;
      el = el.parentElement;
    }
    return root;
  }

  function toSentenceCase(text, capitalizeStart) {
    const lower = text.toLowerCase();
    const pattern = capitalizeStart ? /(^\s*|[.!?]\s+)([a-z])/g : /([.!?]\s+)([a-z])/g;
    return lower.replace(pattern, (_, prefix, ch) => `${prefix}${ch.toUpperCase()}`);
  }

  function getCaseRoots() {
    return Array.from(
      document.querySelectorAll("main, .course-sidebar, .glossary-sidebar, #displayLivePreview")
    );
  }

  function restoreSentenceCaseNodes() {
    touchedTextNodes.forEach((node) => {
      if (node.isConnected && originalTextMap.has(node)) {
        const orig = originalTextMap.get(node);
        if (node.nodeValue !== orig) {
          node.nodeValue = orig;
        }
      }
    });
    touchedTextNodes.clear();
  }

  function applySentenceCaseToRoots() {
    getCaseRoots().forEach((root) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      let node;
      let prevBlock = null;
      let prevEndedSentence = true;

      while ((node = walker.nextNode())) {
        if (!node.nodeValue || !node.nodeValue.trim()) continue;
        if (shouldSkipCaseNode(node, root)) continue;

        const block = getClosestBlock(node, root);
        const capitalizeStart = block !== prevBlock || prevEndedSentence;

        if (!originalTextMap.has(node)) {
          originalTextMap.set(node, node.nodeValue);
        }
        const orig = originalTextMap.get(node);
        const transformed = toSentenceCase(orig, capitalizeStart);
        if (node.nodeValue !== transformed) {
          node.nodeValue = transformed;
        }
        touchedTextNodes.add(node);

        prevBlock = block;
        prevEndedSentence = /[.!?:]\s*$/.test(orig);
      }
    });
  }

  function syncSentenceCase(prefs) {
    const wantSentence = (prefs.textCase || "none") === "sentence";
    if (wantSentence) {
      sentenceCaseActive = true;
      applySentenceCaseToRoots();
      if (!sentenceObserver && "MutationObserver" in window) {
        const mainEl = document.querySelector("main");
        if (mainEl) {
          sentenceObserver = new window.MutationObserver(() => {
            if (!sentenceCaseActive) return;
            if (sentenceReapplyTimer) window.clearTimeout(sentenceReapplyTimer);
            sentenceReapplyTimer = window.setTimeout(() => {
              if (sentenceCaseActive) applySentenceCaseToRoots();
            }, 60);
          });
          sentenceObserver.observe(mainEl, { childList: true, subtree: true });
        }
      }
    } else if (sentenceCaseActive) {
      sentenceCaseActive = false;
      if (sentenceObserver) {
        sentenceObserver.disconnect();
        sentenceObserver = null;
      }
      restoreSentenceCaseNodes();
    }
  }

  // Customizable Reading Guide overlay (highlight / mask / invert / underline + color, height & strength)
  const GUIDE_COLORS = {
    blue: "13, 110, 253",
    yellow: "234, 179, 8",
    green: "34, 197, 94",
    pink: "236, 72, 153",
    purple: "139, 92, 246",
    ink: "73, 80, 87"
  };
  const GUIDE_HEIGHTS_PX = {
    sm: 28,
    md: 42,
    lg: 68,
    xl: 100
  };
  const GUIDE_OPACITY = {
    light: { fill: 0.09, border: 0.3, mask: 0.28, line: 0.5, lineWidth: "2px" },
    medium: { fill: 0.16, border: 0.5, mask: 0.48, line: 0.78, lineWidth: "3px" },
    strong: { fill: 0.26, border: 0.75, mask: 0.68, line: 0.95, lineWidth: "4px" }
  };

  let guideRootEl = null;
  let guideMaskTopEl = null;
  let guideMaskBottomEl = null;
  let guideBandEl = null;
  let guideBound = false;
  let guidePrefs = api.get();
  let guidePointerY = -200;
  let guidePointerInside = false;
  let guideRaf = null;

  function ensureGuideElements() {
    if (guideRootEl) return;
    guideRootEl = document.createElement("div");
    guideRootEl.id = "a11yReadingGuideRoot";
    guideRootEl.setAttribute("aria-hidden", "true");
    guideRootEl.innerHTML =
      '<div id="a11yGuideMaskTop"></div>' +
      '<div id="a11yGuideBand"><div id="a11yGuideTint"></div></div>' +
      '<div id="a11yGuideMaskBottom"></div>';
    document.body.appendChild(guideRootEl);
    guideMaskTopEl = guideRootEl.querySelector("#a11yGuideMaskTop");
    guideMaskBottomEl = guideRootEl.querySelector("#a11yGuideMaskBottom");
    guideBandEl = guideRootEl.querySelector("#a11yGuideBand");
  }

  function resolveGuideHeightPx(val) {
    if (GUIDE_HEIGHTS_PX[val]) return GUIDE_HEIGHTS_PX[val];
    const parsed = parseFloat(String(val || ""));
    return Number.isFinite(parsed) ? Math.min(300, Math.max(14, parsed)) : 42;
  }

  function resolveGuideOpacity(val) {
    if (GUIDE_OPACITY[val]) return GUIDE_OPACITY[val];
    const pct = parseFloat(String(val || ""));
    if (Number.isFinite(pct)) {
      const t = Math.min(95, Math.max(5, pct)) / 100;
      return {
        fill: +(t * 0.35).toFixed(2),
        border: +(Math.min(1, t * 0.95)).toFixed(2),
        mask: +(t * 0.85).toFixed(2),
        line: +(Math.min(1, t * 1.1)).toFixed(2),
        lineWidth: `${Math.max(2, Math.round(1 + t * 4))}px`
      };
    }
    return GUIDE_OPACITY.medium;
  }

  function updateGuideFrame() {
    guideRaf = null;
    if (!guideRootEl || !guidePointerInside) return;

    const style = guidePrefs.readingGuideStyle || "highlight";
    const baseHeight = resolveGuideHeightPx(guidePrefs.readingGuideHeight || "md");
    const bandHeight = style === "underline" ? 4 : baseHeight;
    const bandTop =
      style === "underline"
        ? Math.round(guidePointerY + 10)
        : Math.round(guidePointerY - bandHeight / 2);

    guideBandEl.style.top = `${bandTop}px`;
    guideBandEl.style.height = `${bandHeight}px`;

    if (style === "mask") {
      guideMaskTopEl.style.height = `${Math.max(0, bandTop)}px`;
      guideMaskBottomEl.style.top = `${Math.max(0, bandTop + bandHeight)}px`;
    }

    guideRootEl.style.opacity = "1";
  }

  function onReadingGuideMove(event) {
    if (!guideRootEl || event.pointerType === "touch") return;
    guidePointerY = event.clientY;
    guidePointerInside = true;
    if (guideRaf === null) {
      guideRaf = window.requestAnimationFrame(updateGuideFrame);
    }
  }

  function onReadingGuideLeave() {
    guidePointerInside = false;
    if (guideRootEl) guideRootEl.style.opacity = "0";
  }

  function syncReadingGuide(prefs) {
    guidePrefs = prefs;
    const enabled = Boolean(prefs.readingGuide) && !document.documentElement.classList.contains("print-mode");

    if (enabled) {
      ensureGuideElements();
      const style = prefs.readingGuideStyle || "highlight";
      const rgb = GUIDE_COLORS[prefs.readingGuideColor || "blue"] || GUIDE_COLORS.blue;
      const op = resolveGuideOpacity(prefs.readingGuideOpacity || "medium");

      guideRootEl.className = `guide-style-${style}`;
      guideRootEl.style.setProperty("--guide-rgb", rgb);
      guideRootEl.style.setProperty("--guide-fill-alpha", String(op.fill));
      guideRootEl.style.setProperty("--guide-border-alpha", String(op.border));
      guideRootEl.style.setProperty("--guide-mask-alpha", String(op.mask));
      guideRootEl.style.setProperty("--guide-line-alpha", String(op.line));
      guideRootEl.style.setProperty("--guide-line-width", op.lineWidth);
      guideRootEl.classList.remove("d-none");

      if (!guideBound) {
        window.addEventListener("pointermove", onReadingGuideMove, { passive: true });
        document.addEventListener("pointerleave", onReadingGuideLeave);
        guideBound = true;
      }
      if (guidePointerInside && guideRaf === null) {
        guideRaf = window.requestAnimationFrame(updateGuideFrame);
      }
    } else {
      if (guideRootEl) {
        guideRootEl.classList.add("d-none");
        guideRootEl.style.opacity = "0";
      }
      if (guideBound) {
        window.removeEventListener("pointermove", onReadingGuideMove);
        document.removeEventListener("pointerleave", onReadingGuideLeave);
        guideBound = false;
      }
    }
  }

  // Standalone Screen Magnifier (Windows Magnifier-style Floating Lens & Docked Top Bar)
  const MAG_DIMENSIONS = {
    rect: { sm: [260, 145], md: [360, 190], lg: [480, 250] },
    wide: { sm: [420, 105], md: [580, 135], lg: [760, 175] },
    circle: { sm: [185, 185], md: [245, 245], lg: [320, 320] },
    docked: { sm: [0, 115], md: [0, 165], lg: [0, 230] }
  };

  let magRootEl = null;
  let magViewportEl = null;
  let magStageEl = null;
  let magPageWrapEl = null;
  let magFixedLayerEl = null;
  let magGuideLayerEl = null;
  let magGuideMaskTopEl = null;
  let magGuideBandEl = null;
  let magGuideMaskBottomEl = null;
  let magBound = false;
  let magPrefs = api.get();
  let magPointerX = 0;
  let magPointerY = -200;
  let magPointerInside = false;
  let magDirty = true;
  let magObserver = null;
  let magRebuildTimer = null;
  let magRaf = null;
  let magStickyPairs = [];
  let magScrollPairs = [];

  function ensureMagnifierElements() {
    if (magRootEl) return;
    magRootEl = document.createElement("div");
    magRootEl.id = "a11yMagnifierRoot";
    magRootEl.setAttribute("aria-hidden", "true");
    magRootEl.innerHTML =
      '<div id="a11yMagViewport">' +
      '  <div id="a11yMagStage">' +
      '    <div id="a11yMagPageWrap" class="a11y-mag-clone"></div>' +
      '    <div id="a11yMagFixedLayer" class="a11y-mag-clone"></div>' +
      '    <div id="a11yMagGuideLayer" class="d-none">' +
      '      <div class="mag-guide-mask-top"></div>' +
      '      <div class="mag-guide-band"><div class="mag-guide-tint"></div></div>' +
      '      <div class="mag-guide-mask-bottom"></div>' +
      "    </div>" +
      "  </div>" +
      '  <div id="a11yMagCrosshair"></div>' +
      "</div>";
    document.body.appendChild(magRootEl);
    magViewportEl = magRootEl.querySelector("#a11yMagViewport");
    magStageEl = magRootEl.querySelector("#a11yMagStage");
    magPageWrapEl = magRootEl.querySelector("#a11yMagPageWrap");
    magFixedLayerEl = magRootEl.querySelector("#a11yMagFixedLayer");
    magGuideLayerEl = magRootEl.querySelector("#a11yMagGuideLayer");
    magGuideMaskTopEl = magRootEl.querySelector(".mag-guide-mask-top");
    magGuideBandEl = magRootEl.querySelector(".mag-guide-band");
    magGuideMaskBottomEl = magRootEl.querySelector(".mag-guide-mask-bottom");
  }

  function clearMagnifierClone() {
    magDirty = true;
    magStickyPairs = [];
    magScrollPairs = [];
    if (magPageWrapEl) magPageWrapEl.innerHTML = "";
    if (magFixedLayerEl) magFixedLayerEl.innerHTML = "";
  }

  function syncCloneInputs(origRoot, cloneRoot) {
    const origInputs = Array.from(origRoot.querySelectorAll("input, textarea, select"));
    const cloneInputs = Array.from(cloneRoot.querySelectorAll("input, textarea, select"));
    origInputs.forEach((inp, idx) => {
      const cInp = cloneInputs[idx];
      if (!cInp) return;
      if (inp.tagName === "INPUT" && (inp.type === "checkbox" || inp.type === "radio")) {
        cInp.checked = inp.checked;
      } else {
        cInp.value = inp.value;
      }
    });
  }

  function rebuildMagnifierClone() {
    if (!magPageWrapEl || !magFixedLayerEl) return;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.innerHeight;
    magPageWrapEl.innerHTML = "";
    magFixedLayerEl.innerHTML = "";
    magPageWrapEl.style.width = `${vw}px`;
    magFixedLayerEl.style.width = `${vw}px`;
    magFixedLayerEl.style.height = `${vh}px`;
    magStickyPairs = [];
    magScrollPairs = [];

    const skipIds = new Set([
      "a11yReadingGuideRoot",
      "a11yMagnifierRoot"
    ]);

    Array.from(document.body.children).forEach((child) => {
      if (child.tagName === "SCRIPT" || child.tagName === "STYLE") return;
      if (skipIds.has(child.id)) return;

      const isModal = child.classList.contains("modal");
      const isBackdrop = child.classList.contains("modal-backdrop");
      const isPopover = child.classList.contains("popover");

      if (isModal && !child.classList.contains("show")) return;
      if (isBackdrop && !child.classList.contains("show")) return;

      const clone = child.cloneNode(true);
      syncCloneInputs(child, clone);

      // Fixed viewport overlays (modals, backdrops, popovers) go into the viewport-locked fixed layer
      if (isModal || isBackdrop || isPopover) {
        const rect = child.getBoundingClientRect();
        clone.style.position = "absolute";
        clone.style.left = `${rect.left}px`;
        clone.style.top = `${rect.top}px`;
        clone.style.width = `${rect.width}px`;
        clone.style.height = `${rect.height}px`;
        if (isModal) {
          clone.style.display = "block";
        }

        const origScrolls = Array.from(child.querySelectorAll(".modal-body"));
        const cloneScrolls = Array.from(clone.querySelectorAll(".modal-body"));
        origScrolls.forEach((origEl, idx) => {
          if (cloneScrolls[idx]) {
            magScrollPairs.push({ origEl, cloneEl: cloneScrolls[idx] });
          }
        });

        clone.querySelectorAll("script, style").forEach((n) => n.remove());
        clone.removeAttribute("id");
        clone.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
        magFixedLayerEl.appendChild(clone);
        return;
      }

      // Preserve computed max-width of ID-targeted reading containers before stripping duplicate IDs
      const widthIds = [
        "courseArticleContent",
        "sectionKeyTerms",
        "courseGlossary",
        "courseQuickReference"
      ];
      widthIds.forEach((id) => {
        const origNode = child.id === id ? child : child.querySelector(`#${id}`);
        const cloneNode = clone.id === id ? clone : clone.querySelector(`#${id}`);
        if (origNode && cloneNode) {
          const mw = window.getComputedStyle(origNode).maxWidth;
          if (mw && mw !== "none") cloneNode.style.maxWidth = mw;
        }
      });

      // Pair sticky chrome (navbar & desktop sidebars) so they stay locked in viewport coordinates while scrolling
      const trackSticky = (selector) => {
        const origNodes = child.matches(selector) ? [child] : Array.from(child.querySelectorAll(selector));
        const cloneNodes = clone.matches(selector) ? [clone] : Array.from(clone.querySelectorAll(selector));
        origNodes.forEach((origEl, idx) => {
          const cloneEl = cloneNodes[idx];
          if (!cloneEl) return;
          const pos = window.getComputedStyle(origEl).position;
          if (pos === "sticky" || pos === "fixed") {
            magStickyPairs.push({ origEl, cloneEl, pos });
          }
        });
      };
      trackSticky(".navbar.sticky-top");
      trackSticky(".course-sidebar");
      trackSticky(".glossary-sidebar");
      trackSticky(".dashboard-sidebar");

      const trackScroll = (selector) => {
        const origNodes = Array.from(child.querySelectorAll(selector));
        const cloneNodes = Array.from(clone.querySelectorAll(selector));
        origNodes.forEach((origEl, idx) => {
          if (cloneNodes[idx]) {
            magScrollPairs.push({ origEl, cloneEl: cloneNodes[idx] });
          }
        });
      };
      trackScroll(".course-sidebar-scroll");
      trackScroll(".glossary-sidebar-scroll");

      // Strip scripts, styles, print-only overlays & duplicate IDs
      clone
        .querySelectorAll("script, style, #contentPrintSidebar, #glossaryPrintSidebar, #contentPrintFab, #glossaryPrintFab")
        .forEach((n) => n.remove());
      clone.removeAttribute("id");
      clone.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));

      magPageWrapEl.appendChild(clone);
    });

    magDirty = false;
  }

  function resolveMagnifierDims(mode, shapeKey, sizeVal) {
    if (mode === "docked") {
      if (MAG_DIMENSIONS.docked[sizeVal]) return MAG_DIMENSIONS.docked[sizeVal];
      const customPx = parseFloat(String(sizeVal || ""));
      const h = Number.isFinite(customPx) ? Math.min(420, Math.max(80, Math.round(customPx * 0.45))) : 165;
      return [0, h];
    }
    const shapeTable = MAG_DIMENSIONS[shapeKey] || MAG_DIMENSIONS.rect;
    if (shapeTable[sizeVal]) return shapeTable[sizeVal];
    const customW = parseFloat(String(sizeVal || ""));
    if (Number.isFinite(customW)) {
      const w = Math.min(900, Math.max(120, Math.round(customW)));
      if (shapeKey === "circle") return [w, w];
      if (shapeKey === "wide") return [w, Math.round(w * 0.24)];
      return [w, Math.round(w * 0.52)];
    }
    return shapeTable.md;
  }

  function updateMagnifierFrame() {
    magRaf = null;
    if (!magRootEl || !magPointerInside) return;

    if (magDirty) {
      rebuildMagnifierClone();
    }

    const mode = magPrefs.magnifierMode || "lens";
    const zoom = Math.min(6, Math.max(1.1, Number(magPrefs.magnifierZoom) || 2));
    const sizeKey = magPrefs.magnifierSize || "md";
    const shapeKey = magPrefs.magnifierShape || "rect";
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.innerHeight;
    const scrollX = window.scrollX || 0;
    const scrollY = window.scrollY || 0;

    // Keep cloned page aligned to exact viewport coordinates
    magPageWrapEl.style.transform = `translate3d(${-scrollX}px, ${-scrollY}px, 0)`;

    // Keep sticky & fixed layers (navbar, sidebars, open modals) locked in viewport coordinates
    magStickyPairs.forEach(({ origEl, cloneEl }) => {
      const rect = origEl.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      cloneEl.style.transform = `translate3d(${scrollX}px, ${scrollY}px, 0)`;
    });

    // Keep internal scroll positions synced (sidebars & modal bodies)
    magScrollPairs.forEach(({ origEl, cloneEl }) => {
      if (cloneEl.scrollTop !== origEl.scrollTop) {
        cloneEl.scrollTop = origEl.scrollTop;
      }
    });

    // Mirror active Reading Guide / Ruler inside the magnified stage so it magnifies cleanly too
    if (magGuideLayerEl) {
      const showGuideInMag = Boolean(magPrefs.readingGuide);
      magGuideLayerEl.classList.toggle("d-none", !showGuideInMag);
      if (showGuideInMag) {
        const gStyle = magPrefs.readingGuideStyle || "highlight";
        const gBaseH = resolveGuideHeightPx(magPrefs.readingGuideHeight || "md");
        const gBandH = gStyle === "underline" ? 4 : gBaseH;
        const gBandTop =
          gStyle === "underline"
            ? Math.round(magPointerY + 10)
            : Math.round(magPointerY - gBandH / 2);

        magGuideLayerEl.style.width = `${vw}px`;
        magGuideLayerEl.style.height = `${vh}px`;
        magGuideBandEl.style.top = `${gBandTop}px`;
        magGuideBandEl.style.height = `${gBandH}px`;
        if (gStyle === "mask") {
          magGuideMaskTopEl.style.height = `${Math.max(0, gBandTop)}px`;
          magGuideMaskBottomEl.style.top = `${Math.max(0, gBandTop + gBandH)}px`;
        }
      }
    }

    if (mode === "docked") {
      const barH = resolveMagnifierDims("docked", shapeKey, sizeKey)[1];
      magViewportEl.style.height = `${barH}px`;
      const tx = magPointerX * (1 - zoom);
      const ty = barH / 2 - magPointerY * zoom;
      magStageEl.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${zoom})`;
    } else {
      const dims = resolveMagnifierDims("lens", shapeKey, sizeKey);
      const lensW = Math.min(dims[0], vw - 16);
      const lensH = Math.min(dims[1], vh - 16);
      const lensLeft = Math.max(8, Math.min(vw - lensW - 8, magPointerX - lensW / 2));
      const lensTop = Math.max(8, Math.min(vh - lensH - 8, magPointerY - lensH / 2));

      magViewportEl.style.width = `${lensW}px`;
      magViewportEl.style.height = `${lensH}px`;
      magViewportEl.style.left = `${Math.round(lensLeft)}px`;
      magViewportEl.style.top = `${Math.round(lensTop)}px`;

      const tx = magPointerX - lensLeft - magPointerX * zoom;
      const ty = magPointerY - lensTop - magPointerY * zoom;
      magStageEl.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${zoom})`;
    }

    magRootEl.style.opacity = "1";
  }

  function scheduleMagnifierFrame() {
    if (magRaf === null) {
      magRaf = window.requestAnimationFrame(updateMagnifierFrame);
    }
  }

  function markMagnifierDirty() {
    magDirty = true;
    if (magRebuildTimer) window.clearTimeout(magRebuildTimer);
    magRebuildTimer = window.setTimeout(() => {
      if (magPointerInside && Boolean(magPrefs.magnifier)) {
        scheduleMagnifierFrame();
      }
    }, 90);
  }

  function onMagnifierMove(event) {
    if (!magRootEl || event.pointerType === "touch") return;
    magPointerX = event.clientX;
    magPointerY = event.clientY;
    magPointerInside = true;
    scheduleMagnifierFrame();
  }

  function onMagnifierScroll() {
    if (!magPointerInside) return;
    scheduleMagnifierFrame();
  }

  function onMagnifierLeave() {
    magPointerInside = false;
    if (magRootEl) magRootEl.style.opacity = "0";
  }

  function syncMagnifierObserver(active) {
    if (active) {
      if (!magObserver && "MutationObserver" in window) {
        magObserver = new window.MutationObserver((mutations) => {
          // Ignore mutations inside our own overlay roots
          const relevant = mutations.some(
            (m) => !m.target.closest?.("#a11yMagnifierRoot, #a11yReadingGuideRoot")
          );
          if (relevant) markMagnifierDirty();
        });
        magObserver.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["class", "style"]
        });
      }
    } else if (magObserver) {
      magObserver.disconnect();
      magObserver = null;
    }
  }

  ["shown.bs.modal", "hidden.bs.modal", "shown.bs.offcanvas", "hidden.bs.offcanvas"].forEach((evt) => {
    document.addEventListener(evt, () => {
      if (Boolean(magPrefs.magnifier)) markMagnifierDirty();
    });
  });

  function syncMagnifier(prefs) {
    magPrefs = prefs;
    const enabled = Boolean(prefs.magnifier) && !document.documentElement.classList.contains("print-mode");
    magDirty = true;

    if (enabled) {
      ensureMagnifierElements();
      const mode = prefs.magnifierMode || "lens";
      const shape = prefs.magnifierShape || "rect";
      magRootEl.className = `mag-mode-${mode} mag-shape-${shape}`;
      magRootEl.classList.remove("d-none");

      if (magGuideLayerEl) {
        const gStyle = prefs.readingGuideStyle || "highlight";
        const gRgb = GUIDE_COLORS[prefs.readingGuideColor || "blue"] || GUIDE_COLORS.blue;
        const gOp = resolveGuideOpacity(prefs.readingGuideOpacity || "medium");
        magGuideLayerEl.className = `guide-style-${gStyle}${prefs.readingGuide ? "" : " d-none"}`;
        magGuideLayerEl.style.setProperty("--guide-rgb", gRgb);
        magGuideLayerEl.style.setProperty("--guide-fill-alpha", String(gOp.fill));
        magGuideLayerEl.style.setProperty("--guide-border-alpha", String(gOp.border));
        magGuideLayerEl.style.setProperty("--guide-mask-alpha", String(gOp.mask));
        magGuideLayerEl.style.setProperty("--guide-line-alpha", String(gOp.line));
        magGuideLayerEl.style.setProperty("--guide-line-width", gOp.lineWidth);
      }

      if (!magBound) {
        window.addEventListener("pointermove", onMagnifierMove, { passive: true });
        window.addEventListener("scroll", onMagnifierScroll, { passive: true, capture: true });
        window.addEventListener("resize", markMagnifierDirty, { passive: true });
        document.addEventListener("pointerleave", onMagnifierLeave);
        magBound = true;
      }
      syncMagnifierObserver(true);
      if (magPointerInside) {
        scheduleMagnifierFrame();
      }
    } else {
      syncMagnifierObserver(false);
      clearMagnifierClone();
      if (magRootEl) {
        magRootEl.classList.add("d-none");
        magRootEl.style.opacity = "0";
      }
      if (magBound) {
        window.removeEventListener("pointermove", onMagnifierMove);
        window.removeEventListener("scroll", onMagnifierScroll, { capture: true });
        window.removeEventListener("resize", markMagnifierDirty);
        document.removeEventListener("pointerleave", onMagnifierLeave);
        magBound = false;
      }
    }
  }

  window.addEventListener("shynotes:display-change", (event) => {
    const next = event.detail || api.get();
    syncControls(next);
    syncSentenceCase(next);
    syncReadingGuide(next);
    syncMagnifier(next);
  });

  populateSystemFontGroups(getMergedSystemFonts());
  const initialPrefs = api.get();
  syncControls(initialPrefs);
  syncSentenceCase(initialPrefs);
  syncReadingGuide(initialPrefs);
  syncMagnifier(initialPrefs);
  window.dispatchEvent(new CustomEvent("shynotes:system-fonts-ready"));
})();
