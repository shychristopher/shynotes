(() => {
  const DISPLAY_KEY = "shynotes.display.prefs.v1";
  const COURSE_PREFIX = "shynotes.course.state.v1.";
  const PRINT_PREFIX = "shynotes.content.print.v1.";
  const META_KEY = "shynotes.cloud.meta.v1";

  const MANUAL_COOLDOWN_MS = 45 * 1000;       // 45s cooldown on manual Sync Now
  const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000; // Gentle auto-sync every 5 min when dirty
  const PAGEHIDE_COOLDOWN_MS = 2 * 60 * 1000;  // Minimum 2 min gap for tab-hide flush
  const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // Prune bookmark deletions after 30 days

  const FIREBASE_SDK_VERSION = "11.0.2";

  const navBtn = document.getElementById("cloudSyncNavBtn");
  const navLabel = document.getElementById("cloudSyncNavLabel");
  const navDot = document.getElementById("cloudSyncNavDot");
  const msgEl = document.getElementById("cloudSyncMsg");
  const signedOutWrap = document.getElementById("cloudSyncSignedOut");
  const signedInWrap = document.getElementById("cloudSyncSignedIn");
  const googleBtn = document.getElementById("cloudGoogleSignInBtn");
  const emailForm = document.getElementById("cloudEmailForm");
  const emailInput = document.getElementById("cloudEmailInput");
  const passwordInput = document.getElementById("cloudPasswordInput");
  const emailSubmitBtn = document.getElementById("cloudEmailSubmitBtn");
  const modeToggleBtn = document.getElementById("cloudAuthModeToggleBtn");
  const resetPwBtn = document.getElementById("cloudResetPwBtn");
  const userNameEl = document.getElementById("cloudUserName");
  const userEmailEl = document.getElementById("cloudUserEmail");
  const signOutBtn = document.getElementById("cloudSignOutBtn");
  const stateBadgeEl = document.getElementById("cloudSyncStateBadge");
  const lastSyncedTextEl = document.getElementById("cloudLastSyncedText");
  const syncNowBtn = document.getElementById("cloudSyncNowBtn");
  const exportBtn = document.getElementById("cloudExportBtn");
  const importBtn = document.getElementById("cloudImportBtn");
  const importFileInput = document.getElementById("cloudImportFile");

  function readJson(key, fallback = null) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {
      // Ignore storage errors
    }
  }

  function getMeta() {
    const m = readJson(META_KEY, {}) || {};
    return {
      localUpdatedAt: Number(m.localUpdatedAt) || 0,
      lastSyncedAt: Number(m.lastSyncedAt) || 0,
      lastRemoteUpdatedAt: Number(m.lastRemoteUpdatedAt) || 0,
      displayUpdatedAt: Number(m.displayUpdatedAt) || 0
    };
  }

  function saveMeta(patch) {
    const next = { ...getMeta(), ...patch };
    writeJson(META_KEY, next);
    return next;
  }

  function isDirty() {
    const meta = getMeta();
    return meta.localUpdatedAt > meta.lastSyncedAt;
  }

  function showMessage(text, variant = "info") {
    if (!msgEl) return;
    if (!text) {
      msgEl.classList.add("d-none");
      msgEl.textContent = "";
      return;
    }
    msgEl.className = `alert alert-${variant} py-2 px-3 small mb-0`;
    msgEl.textContent = text;
  }

  // Collect all local Shy Notes state into one compact snapshot object
  function collectLocalSnapshot() {
    const meta = getMeta();
    const display = readJson(DISPLAY_KEY, null);
    const courses = {};
    const contentPrint = {};

    try {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (!key) continue;
        if (key.startsWith(COURSE_PREFIX)) {
          const slug = key.slice(COURSE_PREFIX.length);
          const val = readJson(key, null);
          if (slug && val && typeof val === "object") courses[slug] = val;
        } else if (key.startsWith(PRINT_PREFIX)) {
          const slug = key.slice(PRINT_PREFIX.length);
          const val = readJson(key, null);
          if (slug && val && typeof val === "object") contentPrint[slug] = val;
        }
      }
    } catch (_) {
      // Ignore storage errors
    }

    return {
      version: 1,
      updatedAt: meta.localUpdatedAt || 0,
      display: display ? { ...display, _updatedAt: meta.displayUpdatedAt || meta.localUpdatedAt || 0 } : null,
      courses,
      contentPrint
    };
  }

  function hasMeaningfulData(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return false;
    if (snapshot.display && Object.keys(snapshot.display).some((k) => k !== "_updatedAt")) {
      return true;
    }
    if (snapshot.contentPrint && Object.keys(snapshot.contentPrint).length > 0) {
      return true;
    }
    const courses = snapshot.courses || {};
    return Object.values(courses).some((c) => {
      if (!c || typeof c !== "object") return false;
      const hasPages = c.pages && Object.keys(c.pages).length > 0;
      const hasBookmarks = Array.isArray(c.bookmarks) && c.bookmarks.length > 0;
      const hasFolders = c.folders && Object.keys(c.folders).length > 0;
      return hasPages || hasBookmarks || hasFolders;
    });
  }

  function snapshotFingerprint(snap) {
    if (!snap || typeof snap !== "object") return "";
    return JSON.stringify({
      d: snap.display || null,
      c: snap.courses || {},
      p: snap.contentPrint || {}
    });
  }

  function toMs(ts) {
    if (typeof ts === "number" && Number.isFinite(ts)) return ts;
    if (typeof ts === "string" && ts) {
      const parsed = Date.parse(ts);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  function mergeCourseState(local, remote) {
    if (!local) return remote;
    if (!remote) return local;

    const now = Date.now();
    const localUpdated = toMs(local.updatedAt);
    const remoteUpdated = toMs(remote.updatedAt);

    // Union of known pages
    const knownPages = Array.from(
      new Set([
        ...(Array.isArray(local.knownPages) ? local.knownPages : []),
        ...(Array.isArray(remote.knownPages) ? remote.knownPages : [])
      ])
    );

    // Union of reviewed pages (keep newest reviewedAt per URL)
    const pages = { ...(remote.pages || {}) };
    Object.entries(local.pages || {}).forEach(([url, locRec]) => {
      const remRec = pages[url];
      if (!remRec || toMs(locRec?.reviewedAt) >= toMs(remRec?.reviewedAt)) {
        pages[url] = locRec;
      }
    });

    // Merge bookmark deletion tombstones (pruning tombstones older than 30 days)
    const deletedBookmarks = {};
    [remote.deletedBookmarks, local.deletedBookmarks].forEach((map) => {
      if (!map || typeof map !== "object") return;
      Object.entries(map).forEach(([id, ts]) => {
        const ms = toMs(ts);
        if (ms && now - ms < TOMBSTONE_TTL_MS) {
          deletedBookmarks[id] = Math.max(deletedBookmarks[id] || 0, ms);
        }
      });
    });

    // Merge bookmarks by id, keeping newest updatedAt and respecting tombstones
    const bmMap = new Map();
    [...(Array.isArray(remote.bookmarks) ? remote.bookmarks : []), ...(Array.isArray(local.bookmarks) ? local.bookmarks : [])].forEach((bm) => {
      if (!bm || !bm.id) return;
      const bmTime = toMs(bm.updatedAt);
      const delTime = deletedBookmarks[bm.id] || 0;
      if (delTime > bmTime) return;
      const existing = bmMap.get(bm.id);
      if (!existing || bmTime >= toMs(existing.updatedAt)) {
        bmMap.set(bm.id, bm);
      }
    });

    return {
      version: 1,
      courseSlug: local.courseSlug || remote.courseSlug,
      initializedAt: local.initializedAt || remote.initializedAt || new Date().toISOString(),
      knownPages,
      folders: localUpdated >= remoteUpdated ? { ...(remote.folders || {}), ...(local.folders || {}) } : { ...(local.folders || {}), ...(remote.folders || {}) },
      pages,
      bookmarks: Array.from(bmMap.values()),
      deletedBookmarks,
      updatedAt: Math.max(localUpdated, remoteUpdated, now)
    };
  }

  function mergeSnapshots(local, remote) {
    if (!remote || typeof remote !== "object") return local;

    // Display prefs: newest updatedAt wins
    let display = local.display;
    const locDispTs = toMs(local.display?._updatedAt);
    const remDispTs = toMs(remote.display?._updatedAt);
    if (remote.display && remDispTs > locDispTs) {
      display = remote.display;
    }

    // Courses: merge each slug cleanly
    const allSlugs = new Set([
      ...Object.keys(local.courses || {}),
      ...Object.keys(remote.courses || {})
    ]);
    const courses = {};
    allSlugs.forEach((slug) => {
      courses[slug] = mergeCourseState(local.courses?.[slug], remote.courses?.[slug]);
    });

    const contentPrint = { ...(remote.contentPrint || {}), ...(local.contentPrint || {}) };

    return {
      version: 1,
      updatedAt: Math.max(toMs(local.updatedAt), toMs(remote.updatedAt), Date.now()),
      display,
      courses,
      contentPrint
    };
  }

  let isApplyingCloud = false;

  function applySnapshotLocally(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return;
    isApplyingCloud = true;
    try {
      if (snapshot.display && typeof snapshot.display === "object") {
        const cleanDisplay = { ...snapshot.display };
        const dispTs = toMs(cleanDisplay._updatedAt);
        delete cleanDisplay._updatedAt;
        if (window.ShyNotesDisplay?.update) {
          window.ShyNotesDisplay.update(cleanDisplay);
        } else {
          writeJson(DISPLAY_KEY, cleanDisplay);
        }
        saveMeta({ displayUpdatedAt: dispTs || Date.now() });
      }

      if (snapshot.courses && typeof snapshot.courses === "object") {
        Object.entries(snapshot.courses).forEach(([slug, courseState]) => {
          if (slug && courseState && typeof courseState === "object") {
            writeJson(`${COURSE_PREFIX}${slug}`, courseState);
          }
        });
      }

      if (snapshot.contentPrint && typeof snapshot.contentPrint === "object") {
        Object.entries(snapshot.contentPrint).forEach(([slug, printOpts]) => {
          if (slug && printOpts && typeof printOpts === "object") {
            writeJson(`${PRINT_PREFIX}${slug}`, printOpts);
          }
        });
      }

      window.dispatchEvent(new CustomEvent("shynotes:cloud-applied"));
    } finally {
      isApplyingCloud = false;
    }
  }

  // Export / Import JSON Backup (always active, even without Firebase!)
  exportBtn?.addEventListener("click", () => {
    const snap = collectLocalSnapshot();
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `shynotes-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showMessage("Downloaded backup JSON file.", "success");
  });

  importBtn?.addEventListener("click", () => importFileInput?.click());

  importFileInput?.addEventListener("change", async () => {
    const file = importFileInput.files?.[0];
    importFileInput.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || (!parsed.courses && !parsed.display)) {
        throw new Error("Invalid backup file format.");
      }
      const merged = mergeSnapshots(collectLocalSnapshot(), parsed);
      applySnapshotLocally(merged);
      saveMeta({ localUpdatedAt: Date.now() });
      updateSyncUI();
      showMessage("Imported and merged backup cleanly!", "success");
    } catch (_) {
      showMessage("Could not import that file—make sure it's a valid Shy Notes backup JSON.", "danger");
    }
  });

  // Track local changes for dirty-flagging
  function markLocalDirty(isDisplayChange = false) {
    if (isApplyingCloud) return;
    const now = Date.now();
    saveMeta(isDisplayChange ? { localUpdatedAt: now, displayUpdatedAt: now } : { localUpdatedAt: now });
    updateSyncUI();
  }

  window.addEventListener("shynotes:display-change", () => markLocalDirty(true));
  window.addEventListener("shynotes:course-state-saved", () => markLocalDirty(false));

  // Load Firebase ONLY if configured in _config.yml
  const cfgEl = document.getElementById("shynotesFirebaseConfig");
  let firebaseConfig = null;
  if (cfgEl) {
    try {
      const parsed = JSON.parse(cfgEl.textContent || "{}");
      if (parsed && parsed.apiKey && parsed.projectId) {
        firebaseConfig = parsed;
      }
    } catch (_) {
      firebaseConfig = null;
    }
  }

  let auth = null;
  let db = null;
  let fbAuthMod = null;
  let fbFsMod = null;
  let currentUser = null;
  let isSyncing = false;
  let isRegisterMode = false;
  let cooldownTimer = null;

  function formatRelativeTime(ms) {
    if (!ms) return "Not synced yet";
    const diffSec = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (diffSec < 15) return "Synced just now";
    if (diffSec < 60) return `Synced ${diffSec}s ago`;
    const mins = Math.round(diffSec / 60);
    if (mins < 60) return `Synced ${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `Synced ${hrs}h ago`;
    return `Synced ${new Date(ms).toLocaleDateString()}`;
  }

  function updateSyncUI() {
    if (!firebaseConfig) return;
    const meta = getMeta();
    const dirty = isDirty();
    const remainingMs = Math.max(0, MANUAL_COOLDOWN_MS - (Date.now() - meta.lastSyncedAt));
    const remainingSec = Math.ceil(remainingMs / 1000);

    if (navBtn && navDot) {
      if (currentUser) {
        const displayName = currentUser.displayName || currentUser.email || "Account";
        const statusHint = !navigator.onLine ? "Offline" : dirty ? "Unsaved changes" : "Synced";
        navBtn.title = `${displayName} (${statusHint})`;
        navDot.classList.remove("d-none", "bg-success", "bg-warning", "bg-secondary");
        navDot.classList.add(!navigator.onLine ? "bg-secondary" : dirty ? "bg-warning" : "bg-success");
      } else {
        navBtn.title = "Sign in & cloud sync";
        navDot.classList.add("d-none");
      }
    }

    signedOutWrap?.classList.toggle("d-none", Boolean(currentUser));
    signedInWrap?.classList.toggle("d-none", !currentUser);

    if (currentUser) {
      if (userNameEl) userNameEl.textContent = currentUser.displayName || "Signed in";
      if (userEmailEl) userEmailEl.textContent = currentUser.email || "";
      if (lastSyncedTextEl) lastSyncedTextEl.textContent = formatRelativeTime(meta.lastSyncedAt);

      if (stateBadgeEl) {
        stateBadgeEl.className = "badge rounded-pill border fw-normal";
        if (isSyncing) {
          stateBadgeEl.classList.add("text-bg-primary-subtle", "text-primary-emphasis", "border-primary-subtle");
          stateBadgeEl.textContent = "Syncing…";
        } else if (!navigator.onLine) {
          stateBadgeEl.classList.add("text-bg-secondary-subtle", "text-secondary-emphasis");
          stateBadgeEl.textContent = "Offline (saved locally)";
        } else if (dirty) {
          stateBadgeEl.classList.add("text-bg-warning-subtle", "text-warning-emphasis", "border-warning-subtle");
          stateBadgeEl.textContent = "Unsaved changes";
        } else {
          stateBadgeEl.classList.add("text-bg-success-subtle", "text-success-emphasis", "border-success-subtle");
          stateBadgeEl.textContent = "Up to date";
        }
      }

      if (syncNowBtn) {
        if (isSyncing) {
          syncNowBtn.disabled = true;
          syncNowBtn.textContent = "Syncing…";
        } else if (!navigator.onLine) {
          syncNowBtn.disabled = true;
          syncNowBtn.textContent = "Offline";
        } else if (remainingSec > 0) {
          syncNowBtn.disabled = true;
          syncNowBtn.textContent = `Cooldown (${remainingSec}s)`;
        } else {
          syncNowBtn.disabled = false;
          syncNowBtn.textContent = "Sync now";
        }
      }
    }

    if (remainingSec > 0 && currentUser && !cooldownTimer) {
      cooldownTimer = window.setInterval(() => {
        const left = MANUAL_COOLDOWN_MS - (Date.now() - getMeta().lastSyncedAt);
        if (left <= 0) {
          window.clearInterval(cooldownTimer);
          cooldownTimer = null;
        }
        updateSyncUI();
      }, 1000);
    }
  }

  async function syncWithCloud({ force = false } = {}) {
    if (!currentUser || !db || !fbFsMod || isSyncing || !navigator.onLine) return;

    const meta = getMeta();
    const now = Date.now();
    if (!force && now - meta.lastSyncedAt < MANUAL_COOLDOWN_MS) return;

    isSyncing = true;
    updateSyncUI();

    try {
      const userDocRef = fbFsMod.doc(db, "users", currentUser.uid);
      const snap = await fbFsMod.getDoc(userDocRef);
      const remoteData = snap.exists() ? snap.data() : null;
      const localData = collectLocalSnapshot();

      const localHasChanges = meta.localUpdatedAt > meta.lastSyncedAt;
      const localHasContent = hasMeaningfulData(localData);
      const remoteHasContent = hasMeaningfulData(remoteData);
      const remoteUpdatedAt = toMs(remoteData?.updatedAt);
      const remoteChangedSinceSync = Boolean(
        remoteData && remoteUpdatedAt > meta.lastRemoteUpdatedAt
      );

      // Decide sync direction cleanly based on timestamps & change flags:
      //   "none"  -> already in sync (0 writes)
      //   "down"  -> cloud is newer & local has no unsaved edits (0 writes!)
      //   "up"    -> local has newer edits & cloud hasn't changed since last sync
      //   "merge" -> both devices changed independently (safe timestamp merge + upload)
      let direction = "none";

      if (!remoteData) {
        direction = localHasContent ? "up" : "none";
      } else if (!localHasChanges) {
        if (remoteChangedSinceSync || (!localHasContent && remoteHasContent)) {
          direction = "down";
        } else {
          direction = "none";
        }
      } else if (remoteChangedSinceSync) {
        // Safeguard: never let a blank/unmodified device overwrite populated cloud data
        direction = !localHasContent && remoteHasContent ? "down" : "merge";
      } else if (!localHasContent && remoteHasContent && meta.lastSyncedAt === 0) {
        // First sign-in on a brand-new device with empty local state -> always pull down
        direction = "down";
      } else {
        direction = meta.localUpdatedAt >= remoteUpdatedAt ? "up" : "merge";
      }

      if (direction === "none") {
        const syncedAt = Date.now();
        saveMeta({
          lastSyncedAt: syncedAt,
          lastRemoteUpdatedAt: remoteUpdatedAt || meta.lastRemoteUpdatedAt
        });
        showMessage("Already up to date (0 writes used).", "success");
        return;
      }

      if (direction === "down") {
        applySnapshotLocally(remoteData);
        const syncedAt = Date.now();
        saveMeta({
          lastSyncedAt: syncedAt,
          localUpdatedAt: syncedAt,
          lastRemoteUpdatedAt: remoteUpdatedAt || syncedAt
        });
        showMessage("Synced down from cloud (newer data found).", "success");
        return;
      }

      // "up" or "merge"
      const finalSnapshot =
        direction === "merge"
          ? mergeSnapshots(localData, remoteData)
          : { ...localData, updatedAt: Date.now() };

      if (direction === "merge") {
        applySnapshotLocally(finalSnapshot);
      }

      const remoteFp = snapshotFingerprint(remoteData);
      const finalFp = snapshotFingerprint(finalSnapshot);
      const syncedAt = Date.now();

      if (!remoteData || remoteFp !== finalFp) {
        finalSnapshot.updatedAt = syncedAt;
        await fbFsMod.setDoc(userDocRef, finalSnapshot, { merge: false });
        saveMeta({
          lastSyncedAt: syncedAt,
          localUpdatedAt: syncedAt,
          lastRemoteUpdatedAt: syncedAt
        });
        showMessage(
          direction === "merge"
            ? "Merged local and cloud changes."
            : "Synced local changes up to cloud.",
          "success"
        );
      } else {
        saveMeta({
          lastSyncedAt: syncedAt,
          localUpdatedAt: syncedAt,
          lastRemoteUpdatedAt: remoteUpdatedAt || syncedAt
        });
        showMessage("Already up to date (0 writes used).", "success");
      }
    } catch (err) {
      showMessage(`Sync failed: ${err?.message || "check your connection and Firestore rules."}`, "danger");
    } finally {
      isSyncing = false;
      updateSyncUI();
    }
  }

  async function initFirebase() {
    if (!firebaseConfig) return;
    try {
      const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
      const [appMod, authMod, fsMod] = await Promise.all([
        import(`${base}/firebase-app.js`),
        import(`${base}/firebase-auth.js`),
        import(`${base}/firebase-firestore.js`)
      ]);

      fbAuthMod = authMod;
      fbFsMod = fsMod;
      const app = appMod.initializeApp(firebaseConfig);
      auth = authMod.getAuth(app);
      db = fsMod.getFirestore(app);

      // Handle mobile/PWA redirect sign-in results cleanly
      authMod.getRedirectResult(auth).catch(() => {});

      authMod.onAuthStateChanged(auth, (user) => {
        const wasSignedOut = !currentUser;
        currentUser = user || null;
        updateSyncUI();
        // Pull once when session starts or user signs in
        if (currentUser && wasSignedOut) {
          syncWithCloud({ force: true });
        }
      });

      // Gentle 5-minute auto-sync ONLY when dirty & online
      window.setInterval(() => {
        if (!currentUser || !navigator.onLine || !isDirty()) return;
        const elapsed = Date.now() - getMeta().lastSyncedAt;
        if (elapsed >= AUTO_SYNC_INTERVAL_MS) {
          syncWithCloud({ force: false });
        }
      }, 60 * 1000);

      // Safety flush when leaving tab if dirty & past 2-minute cooldown
      document.addEventListener("visibilitychange", () => {
        if (document.hidden && currentUser && navigator.onLine && isDirty()) {
          const elapsed = Date.now() - getMeta().lastSyncedAt;
          if (elapsed >= PAGEHIDE_COOLDOWN_MS) {
            syncWithCloud({ force: false });
          }
        }
      });

      window.addEventListener("online", updateSyncUI);
      window.addEventListener("offline", updateSyncUI);
    } catch (_) {
      showMessage("Could not load Firebase SDK (offline or blocked).", "warning");
    }
  }

  googleBtn?.addEventListener("click", async () => {
    if (!auth || !fbAuthMod) return;
    showMessage("");
    const provider = new fbAuthMod.GoogleAuthProvider();
    try {
      await fbAuthMod.signInWithPopup(auth, provider);
    } catch (err) {
      if (err?.code === "auth/popup-blocked" || err?.code === "auth/operation-not-supported-in-this-environment") {
        await fbAuthMod.signInWithRedirect(auth, provider);
      } else if (err?.code !== "auth/popup-closed-by-user") {
        showMessage(err?.message || "Google sign-in failed.", "danger");
      }
    }
  });

  modeToggleBtn?.addEventListener("click", () => {
    isRegisterMode = !isRegisterMode;
    if (emailSubmitBtn) emailSubmitBtn.textContent = isRegisterMode ? "Create account" : "Sign in";
    if (modeToggleBtn) modeToggleBtn.textContent = isRegisterMode ? "Back to sign in" : "Create account";
    showMessage("");
  });

  emailForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!auth || !fbAuthMod) return;
    const email = (emailInput?.value || "").trim();
    const pw = passwordInput?.value || "";
    if (!email || pw.length < 6) {
      showMessage("Enter a valid email and a password of at least 6 characters.", "warning");
      return;
    }
    showMessage("");
    try {
      if (isRegisterMode) {
        await fbAuthMod.createUserWithEmailAndPassword(auth, email, pw);
      } else {
        await fbAuthMod.signInWithEmailAndPassword(auth, email, pw);
      }
      if (passwordInput) passwordInput.value = "";
    } catch (err) {
      showMessage(err?.message || "Authentication failed.", "danger");
    }
  });

  resetPwBtn?.addEventListener("click", async () => {
    if (!auth || !fbAuthMod) return;
    const email = (emailInput?.value || "").trim();
    if (!email) {
      showMessage("Enter your email above first, then click Forgot password.", "warning");
      emailInput?.focus();
      return;
    }
    try {
      await fbAuthMod.sendPasswordResetEmail(auth, email);
      showMessage(`Password reset email sent to ${email}.`, "success");
    } catch (err) {
      showMessage(err?.message || "Could not send reset email.", "danger");
    }
  });

  signOutBtn?.addEventListener("click", async () => {
    if (!auth || !fbAuthMod) return;
    await fbAuthMod.signOut(auth);
    showMessage("Signed out. Your local progress stays safely in this browser.", "info");
  });

  syncNowBtn?.addEventListener("click", () => {
    showMessage("");
    syncWithCloud({ force: false });
  });

  document.getElementById("cloudSyncModal")?.addEventListener("show.bs.modal", () => {
    showMessage("");
    updateSyncUI();
  });

  if (firebaseConfig) {
    initFirebase();
  }
})();
