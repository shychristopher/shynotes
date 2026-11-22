(() => {
  if (document.documentElement.classList.contains("print-mode")) return;

  const dataEl = document.getElementById("courseGlossaryLookupData");
  const articleEl = document.getElementById("courseArticleContent");
  if (!dataEl || !articleEl) return;

  let payload;
  try {
    payload = JSON.parse(dataEl.textContent || "{}");
  } catch (_) {
    return;
  }

  const terms = Array.isArray(payload.terms) ? payload.terms : [];
  const glossaryUrl = payload.glossaryUrl || "";
  if (!terms.length) return;

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function isAcronym(phrase) {
    return phrase.length <= 6 && phrase === phrase.toUpperCase() && /[A-Z]/.test(phrase);
  }

  // Build match entries (term + aliases), longest phrases first
  const entries = [];
  terms.forEach((item) => {
    if (!item || !item.term) return;
    const phrases = [item.term];
    if (Array.isArray(item.aliases)) {
      item.aliases.forEach((a) => {
        if (typeof a === "string" && a.trim().length >= 2) phrases.push(a.trim());
      });
    }
    phrases.forEach((phrase) => {
      const clean = phrase.trim();
      if (clean.length < 2) return;
      entries.push({
        phrase: clean,
        caseSensitive: isAcronym(clean),
        term: item
      });
    });
  });

  entries.sort((a, b) => b.phrase.length - a.phrase.length);
  if (!entries.length) return;

  const SKIP_TAGS = new Set([
    "A",
    "BUTTON",
    "CODE",
    "PRE",
    "SCRIPT",
    "STYLE",
    "TEXTAREA",
    "INPUT",
    "SELECT",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6"
  ]);

  function shouldSkipNode(node) {
    let parent = node.parentElement;
    while (parent && parent !== articleEl) {
      if (SKIP_TAGS.has(parent.tagName)) return true;
      if (parent.classList.contains("glossary-lookup-term")) return true;
      parent = parent.parentElement;
    }
    return false;
  }

  const matchedTermIds = new Set();
  const createdTriggers = [];

  // Match first occurrence of each glossary term across article text nodes
  entries.forEach((entry) => {
    const termId = entry.term.id;
    if (matchedTermIds.has(termId)) return;

    const flags = entry.caseSensitive ? "" : "i";
    const regex = new RegExp(`\\b(${escapeRegex(entry.phrase)})\\b`, flags);

    const walker = document.createTreeWalker(articleEl, NodeFilter.SHOW_TEXT, null);
    let textNode;
    while ((textNode = walker.nextNode())) {
      if (!textNode.nodeValue || !textNode.nodeValue.trim()) continue;
      if (shouldSkipNode(textNode)) continue;

      const match = regex.exec(textNode.nodeValue);
      if (!match) continue;

      const matchStart = match.index;
      const matchText = match[1];
      const matchEnd = matchStart + matchText.length;

      const before = textNode.nodeValue.slice(0, matchStart);
      const after = textNode.nodeValue.slice(matchEnd);

      const trigger = document.createElement("span");
      trigger.className = "glossary-lookup-term";
      trigger.setAttribute("tabindex", "0");
      trigger.setAttribute("role", "button");
      trigger.dataset.termId = termId;
      trigger.textContent = matchText;

      const frag = document.createDocumentFragment();
      if (before) frag.appendChild(document.createTextNode(before));
      frag.appendChild(trigger);
      if (after) frag.appendChild(document.createTextNode(after));

      textNode.parentNode.replaceChild(frag, textNode);
      matchedTermIds.add(termId);
      createdTriggers.push({ trigger, term: entry.term });
      break;
    }
  });

  if (!createdTriggers.length || !window.bootstrap?.Popover) return;

  let activePopover = null;
  let activeTrigger = null;
  const closeTimers = new WeakMap();

  function cancelClose(trigger) {
    const timer = closeTimers.get(trigger);
    if (timer) {
      window.clearTimeout(timer);
      closeTimers.delete(trigger);
    }
  }

  function hideActive(exceptTrigger = null) {
    if (activePopover && activeTrigger && activeTrigger !== exceptTrigger) {
      cancelClose(activeTrigger);
      activePopover.hide();
      activePopover = null;
      activeTrigger = null;
    }
  }

  function scheduleClose(trigger, popover, delay = 180) {
    cancelClose(trigger);
    const timer = window.setTimeout(() => {
      popover.hide();
      if (activeTrigger === trigger) {
        activePopover = null;
        activeTrigger = null;
      }
    }, delay);
    closeTimers.set(trigger, timer);
  }

  createdTriggers.forEach(({ trigger, term }) => {
    const titleHtml = term.full
      ? `<span class="fw-bold">${escapeHtml(term.term)}</span> <span class="text-body-secondary fw-normal">— ${escapeHtml(term.full)}</span>`
      : `<span class="fw-bold">${escapeHtml(term.term)}</span>`;

    const href = `${glossaryUrl}#term-${encodeURIComponent(term.id)}`;
    const bodyHtml = `
      <div class="small mb-2">${escapeHtml(term.definition)}</div>
      <div class="d-flex justify-content-between align-items-center gap-2 pt-1 border-top">
        ${term.category ? `<span class="badge rounded-pill text-bg-secondary-subtle text-secondary-emphasis border fw-normal">${escapeHtml(term.category)}</span>` : "<span></span>"}
        <a href="${href}" class="small text-decoration-none fw-medium">Open in Glossary →</a>
      </div>
    `;

    const popover = new window.bootstrap.Popover(trigger, {
      html: true,
      sanitize: false,
      trigger: "manual",
      placement: "auto",
      container: "body",
      customClass: "glossary-lookup-popover",
      title: titleHtml,
      content: bodyHtml
    });

    function showPopover() {
      cancelClose(trigger);
      hideActive(trigger);
      popover.show();
      activePopover = popover;
      activeTrigger = trigger;

      const tip = popover.tip;
      if (tip && !tip.dataset.hoverWired) {
        tip.dataset.hoverWired = "true";
        tip.addEventListener("mouseenter", () => cancelClose(trigger));
        tip.addEventListener("mouseleave", () => scheduleClose(trigger, popover, 150));
      }
    }

    trigger.addEventListener("mouseenter", showPopover);
    trigger.addEventListener("mouseleave", () => scheduleClose(trigger, popover, 180));
    trigger.addEventListener("focus", showPopover);
    trigger.addEventListener("blur", (event) => {
      const next = event.relatedTarget;
      if (next && popover.tip && popover.tip.contains(next)) return;
      scheduleClose(trigger, popover, 160);
    });

    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (activeTrigger === trigger) {
        hideActive();
      } else {
        showPopover();
      }
    });
  });

  document.addEventListener("click", (event) => {
    if (!activePopover || !activeTrigger) return;
    if (event.target === activeTrigger) return;
    if (activePopover.tip && activePopover.tip.contains(event.target)) return;
    hideActive();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideActive();
  });
})();
