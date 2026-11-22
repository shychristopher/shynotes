(() => {
  if (!document.documentElement.classList.contains("course-view-mindmap")) return;

  const viewer = document.getElementById("courseMindmapViewer");
  const dataEl = document.getElementById("courseMindmapsData");
  if (!viewer || !dataEl) return;

  const titleEl = document.getElementById("mindmapTitle");
  const descEl = document.getElementById("mindmapDescription");
  const backLink = document.getElementById("mindmapBackLink");
  const backLabel = document.getElementById("mindmapBackLabel");
  const toolbarEl = document.getElementById("mindmapToolbar");
  const stageEl = document.getElementById("mindmapStage");
  const loadingEl = document.getElementById("mindmapLoading");
  const svgEl = document.getElementById("mindmapSvg");
  const mediaWrap = document.getElementById("mindmapMediaWrap");
  const notFoundEl = document.getElementById("mindmapNotFound");
  const helpHintEl = document.getElementById("mindmapHelpHint");

  const zoomInBtn = document.getElementById("mindmapZoomInBtn");
  const zoomOutBtn = document.getElementById("mindmapZoomOutBtn");
  const fitBtn = document.getElementById("mindmapFitBtn");
  const expandBtn = document.getElementById("mindmapExpandBtn");
  const collapseBtn = document.getElementById("mindmapCollapseBtn");
  const fullscreenBtn = document.getElementById("mindmapFullscreenBtn");

  let maps = {};
  try {
    maps = JSON.parse(dataEl.textContent || "{}");
  } catch (_) {
    maps = {};
  }

  const params = new URLSearchParams(window.location.search);
  const mapKeys = Object.keys(maps);
  const requestedId = params.get("map") || mapKeys[0] || "";
  const mapObj = maps[requestedId] || null;

  // Wire back link to the exact page/section the student came from (same-origin only)
  const fromParam = params.get("from") || "";
  const fromLabelParam = params.get("from_label") || "";
  if (fromParam && fromParam.startsWith("/") && !fromParam.startsWith("//") && backLink) {
    backLink.href = fromParam;
    if (backLabel) {
      backLabel.textContent = fromLabelParam ? `Back to ${fromLabelParam}` : "Back";
    }
  }

  if (!mapObj) {
    stageEl?.classList.add("d-none");
    toolbarEl?.classList.add("d-none");
    helpHintEl?.classList.add("d-none");
    notFoundEl?.classList.remove("d-none");
    return;
  }

  const mapTitle = mapObj.title || requestedId || "Mind Map";
  if (titleEl) titleEl.textContent = mapTitle;
  document.title = `${mapTitle} · Mind Map`;

  if (descEl && mapObj.description) {
    descEl.textContent = mapObj.description;
    descEl.classList.remove("d-none");
  }

  // Fallback mode 1: External embed URL (e.g. Miro, Excalidraw, Whimsical)
  if (mapObj.embed_url) {
    loadingEl?.classList.add("d-none");
    svgEl?.classList.add("d-none");
    toolbarEl?.classList.add("d-none");
    helpHintEl?.classList.add("d-none");
    if (mediaWrap) {
      mediaWrap.classList.remove("d-none");
      const iframe = document.createElement("iframe");
      iframe.src = mapObj.embed_url;
      iframe.title = mapTitle;
      iframe.className = "w-100 h-100 border-0";
      iframe.allowFullscreen = true;
      mediaWrap.appendChild(iframe);
    }
    return;
  }

  // Fallback mode 2: Static mind map image (PNG/SVG)
  if (mapObj.image && !mapObj.content) {
    loadingEl?.classList.add("d-none");
    svgEl?.classList.add("d-none");
    expandBtn?.closest(".btn-group")?.classList.add("d-none");
    helpHintEl.textContent = "Tip: Use zoom controls or open fullscreen to inspect the mind map.";
    if (mediaWrap) {
      mediaWrap.classList.remove("d-none");
      mediaWrap.classList.add("overflow-auto", "p-3", "text-center");
      const img = document.createElement("img");
      img.src = mapObj.image;
      img.alt = mapTitle;
      img.style.maxWidth = "100%";
      img.style.transition = "transform 0.15s ease";
      img.style.transformOrigin = "top center";
      mediaWrap.appendChild(img);

      let imgScale = 1;
      zoomInBtn?.addEventListener("click", () => {
        imgScale = Math.min(3, +(imgScale + 0.25).toFixed(2));
        img.style.transform = `scale(${imgScale})`;
      });
      zoomOutBtn?.addEventListener("click", () => {
        imgScale = Math.max(0.5, +(imgScale - 0.25).toFixed(2));
        img.style.transform = `scale(${imgScale})`;
      });
      fitBtn?.addEventListener("click", () => {
        imgScale = 1;
        img.style.transform = "scale(1)";
      });
    }
    return;
  }

  // Primary mode: Interactive Markmap rendered from Markdown content
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      s.crossOrigin = "anonymous";
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function setFoldDepth(node, maxDepth, currentDepth = 0) {
    if (!node) return;
    node.payload = node.payload || {};
    if (Array.isArray(node.children) && node.children.length > 0) {
      node.payload.fold = currentDepth >= maxDepth ? 1 : 0;
      node.children.forEach((child) => setFoldDepth(child, maxDepth, currentDepth + 1));
    }
  }

  async function initMarkmap() {
    try {
      await loadScript("https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js");
      await loadScript("https://cdn.jsdelivr.net/npm/markmap-lib@0.17.2/dist/browser/index.iife.js");
      await loadScript("https://cdn.jsdelivr.net/npm/markmap-view@0.17.2/dist/browser/index.js");

      const { Transformer, Markmap, deriveOptions } = window.markmap || {};
      if (!Transformer || !Markmap) {
        throw new Error("Markmap failed to load.");
      }

      const transformer = new Transformer();
      const { root } = transformer.transform(String(mapObj.content || `# ${mapTitle}`));
      const options = deriveOptions
        ? deriveOptions({
            colorFreezeLevel: 2,
            duration: 280,
            maxWidth: 280,
            paddingX: 16
          })
        : { duration: 280, maxWidth: 280, paddingX: 16 };

      loadingEl?.classList.add("d-none");
      const mm = Markmap.create(svgEl, options, root);

      window.setTimeout(() => mm.fit(), 80);

      zoomInBtn?.addEventListener("click", () => mm.rescale(1.25));
      zoomOutBtn?.addEventListener("click", () => mm.rescale(0.8));
      fitBtn?.addEventListener("click", () => mm.fit());

      expandBtn?.addEventListener("click", () => {
        setFoldDepth(root, 99);
        mm.setData(root);
        window.setTimeout(() => mm.fit(), 100);
      });

      collapseBtn?.addEventListener("click", () => {
        setFoldDepth(root, 1);
        mm.setData(root);
        window.setTimeout(() => mm.fit(), 100);
      });

      window.addEventListener("resize", () => mm.fit());
      document.addEventListener("fullscreenchange", () => {
        if (fullscreenBtn) {
          fullscreenBtn.textContent = document.fullscreenElement ? "Exit Fullscreen" : "Fullscreen";
        }
        window.setTimeout(() => mm.fit(), 120);
      });
    } catch (_) {
      if (loadingEl) {
        loadingEl.textContent = "Could not load interactive mind map viewer (check internet connection).";
      }
    }
  }

  fullscreenBtn?.addEventListener("click", () => {
    if (!stageEl) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      stageEl.requestFullscreen?.();
    }
  });

  initMarkmap();
})();
