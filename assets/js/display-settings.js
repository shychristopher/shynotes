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

    prefSwitches.forEach((sw) => {
      const key = sw.dataset.displayKey;
      if (key) {
        sw.checked = Boolean(prefs[key]);
      }
    });
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

  prefSwitches.forEach((sw) => {
    sw.addEventListener("change", () => {
      const key = sw.dataset.displayKey;
      if (key) api.update({ [key]: sw.checked });
    });
  });

  resetBtn?.addEventListener("click", () => {
    setStatus("");
    api.reset();
  });

  window.addEventListener("shynotes:display-change", (event) => {
    syncControls(event.detail || api.get());
  });

  populateSystemFontGroups(getMergedSystemFonts());
  syncControls(api.get());
  window.dispatchEvent(new CustomEvent("shynotes:system-fonts-ready"));
})();
