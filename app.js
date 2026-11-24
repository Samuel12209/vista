(() => {
  const icon = window.vistaIcon;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const el = {
    menuBtn: $("#menuBtn"),
    sidebar: $("#sidebar"),
    sidebarScrim: $("#sidebarScrim"),
    searchForm: $("#searchForm"),
    searchInput: $("#searchInput"),
    themeBtn: $("#themeBtn"),
    createBtn: $("#createBtn"),
    mobileCreateBtn: $("#mobileCreateBtn"),
    notifBtn: $("#notifBtn"),
    notifPanel: $("#notifPanel"),
    notifBadge: $("#notifBadge"),
    markReadBtn: $("#markReadBtn"),
    profileBtn: $("#profileBtn"),
    profilePanel: $("#profilePanel"),
    profileThemeLabel: $("#profileThemeLabel"),
    homeView: $("#homeView"),
    watchView: $("#watchView"),
    watchMain: $("#watchMain"),
    watchRail: $("#watchRail"),
    chips: $("#chips"),
    videoGrid: $("#videoGrid"),
    emptyState: $("#emptyState"),
    emptyTitle: $("#emptyTitle"),
    emptyBody: $("#emptyBody"),
    emptyAction: $("#emptyAction"),
    feedTitle: $("#feedTitle"),
    feedEyebrow: $("#feedEyebrow"),
    feedCount: $("#feedCount"),
    densityBtn: $("#densityBtn"),
    createDialog: $("#createDialog"),
    addForm: $("#addForm"),
    videoFile: $("#videoFile"),
    videoUrl: $("#videoUrl"),
    videoTitle: $("#videoTitle"),
    addStatus: $("#addStatus"),
    addSubmit: $("#addSubmit"),
    dropzone: $("#dropzone"),
    dropLabel: $("#dropLabel"),
    dropHint: $("#dropHint"),
    closeCreateBtn: $("#closeCreateBtn"),
    cancelCreateBtn: $("#cancelCreateBtn"),
    toastStack: $("#toastStack"),
  };

  const STORAGE = {
    theme: "vista.theme",
    collapsed: "vista.collapsed",
    compact: "vista.compact",
    saved: "vista.saved",
    liked: "vista.liked",
    disliked: "vista.disliked",
    subscribed: "vista.subscribed",
    progress: "vista.progress",
    posters: "vista.posters",
    added: "vista.added",
    volume: "vista.volume",
    rate: "vista.rate",
  };

  const CORS_ORIGINS = window.VISTA_CORS_ORIGINS || [];

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Quota or private mode; the session still works in memory. */
    }
  }

  const INITIAL_SUBSCRIPTIONS = [
    "Field Notes",
    "Moss & Pine",
    "Lowlight Studio",
    "Open Road",
    "Signal Path",
  ];

  function readSet(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return new Set(value ? JSON.parse(value) : fallback);
    } catch {
      return new Set(fallback);
    }
  }

  function persistSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify([...value]));
    } catch {
      /* Storage can be unavailable in private or file:// contexts. */
    }
  }

  function readValue(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function persistValue(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Storage can be unavailable in private or file:// contexts. */
    }
  }

  const state = {
    query: "",
    category: "All",
    section: "home",
    channel: null,
    watching: null,
    compact: readValue(STORAGE.compact) === "true",
    autoplay: true,
    hidden: new Set(),
    saved: readSet(STORAGE.saved, []),
    liked: readSet(STORAGE.liked, []),
    disliked: readSet(STORAGE.disliked, []),
    subscribed: readSet(STORAGE.subscribed, INITIAL_SUBSCRIPTIONS),
    comments: {},
    userVideos: [],
    objectUrls: new Map(),
    pendingFile: null,
    progress: readJSON(STORAGE.progress, {}),
    posters: readJSON(STORAGE.posters, {}),
  };

  /* ---------- Library ---------- */

  // Videos the user added come first, then the demo set.
  function library() {
    return [...state.userVideos, ...window.VIDEO_DATA];
  }

  function sourceFor(video) {
    return video.src || (window.VISTA_SOURCES || {})[video.id] || "";
  }

  function canCapture(src) {
    if (!src) return false;
    if (src.startsWith("blob:") || src.startsWith("data:")) return true;
    try {
      return CORS_ORIGINS.includes(new URL(src).origin);
    } catch {
      return false;
    }
  }

  function posterFor(video) {
    return state.posters[video.id] || video.poster || "";
  }

  function savePoster(id, dataUrl) {
    if (!dataUrl) return;
    // Keep the cache bounded so localStorage cannot fill up.
    const keys = Object.keys(state.posters);
    if (keys.length > 60) keys.slice(0, 20).forEach((key) => delete state.posters[key]);
    state.posters[id] = dataUrl;
    writeJSON(STORAGE.posters, state.posters);
  }

  function progressFor(id) {
    const entry = state.progress[id];
    if (!entry || !entry.d) return 0;
    return Math.min(100, Math.max(0, (entry.t / entry.d) * 100));
  }

  function saveProgress(id, time, duration) {
    if (!duration || !isFinite(duration)) return;
    state.progress[id] = { t: time, d: duration };
    writeJSON(STORAGE.progress, state.progress);
  }

  // Demo entries carry display durations for the design. Once a clip is
  // reachable we replace them with the real length so the card never lies.
  let durationsHydrated = false;

  async function hydrateDurations() {
    if (durationsHydrated) return;
    durationsHydrated = true;

    const targets = window.VIDEO_DATA.filter((video) => sourceFor(video) && !video.length);
    const queue = [...targets];
    let changed = false;

    // Four at a time keeps the metadata requests from competing.
    const worker = async () => {
      while (queue.length) {
        const video = queue.shift();
        const src = sourceFor(video);
        const capture = !posterFor(video) && canCapture(src);
        const { duration, poster } = await probeMedia(src, capture);
        if (poster) savePoster(video.id, poster);
        if (!duration) continue;
        video.length = duration;
        video.duration = formatTime(duration);
        changed = true;
      }
    };

    await Promise.all(Array.from({ length: 4 }, worker));
    if (changed) renderFeed();
  }

  /* ---------- Local file storage (IndexedDB) ---------- */

  const MEDIA_DB = "vista-media";
  const MEDIA_STORE = "files";

  function openMediaDB() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB is unavailable in this browser."));
        return;
      }
      const request = indexedDB.open(MEDIA_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(MEDIA_STORE)) db.createObjectStore(MEDIA_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function putFile(id, file) {
    const db = await openMediaDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE, "readwrite");
      tx.objectStore(MEDIA_STORE).put(file, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  async function getFile(id) {
    const db = await openMediaDB();
    const blob = await new Promise((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE, "readonly");
      const request = tx.objectStore(MEDIA_STORE).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return blob;
  }

  async function deleteFile(id) {
    const db = await openMediaDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE, "readwrite");
      tx.objectStore(MEDIA_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  /* ---------- Media probing ---------- */

  // Reads real duration, dimensions and a poster frame from a video source.
  function probeMedia(src, capture) {
    return new Promise((resolve) => {
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.muted = true;
      probe.playsInline = true;
      if (capture && /^https?:/i.test(src)) probe.crossOrigin = "anonymous";
      probe.src = src;

      const finish = (result) => {
        probe.removeAttribute("src");
        probe.load();
        resolve(result);
      };

      const timer = window.setTimeout(() => finish({ duration: 0, poster: "" }), 12000);

      probe.addEventListener("error", () => {
        window.clearTimeout(timer);
        finish({ duration: 0, poster: "" });
      });

      probe.addEventListener("loadedmetadata", () => {
        const duration = isFinite(probe.duration) ? probe.duration : 0;
        if (!capture) {
          window.clearTimeout(timer);
          finish({ duration, poster: "" });
          return;
        }
        // Grab a frame a moment in, when there is actual picture.
        probe.addEventListener(
          "seeked",
          () => {
            let poster = "";
            try {
              const canvas = document.createElement("canvas");
              const width = 480;
              const ratio = probe.videoHeight ? probe.videoHeight / probe.videoWidth : 0.5625;
              canvas.width = width;
              canvas.height = Math.round(width * ratio) || 270;
              canvas.getContext("2d").drawImage(probe, 0, 0, canvas.width, canvas.height);
              poster = canvas.toDataURL("image/jpeg", 0.72);
            } catch {
              poster = "";
            }
            window.clearTimeout(timer);
            finish({ duration, poster });
          },
          { once: true },
        );
        try {
          probe.currentTime = Math.min(1.2, (duration || 2) / 3);
        } catch {
          window.clearTimeout(timer);
          finish({ duration, poster: "" });
        }
      });
    });
  }

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  function makeId() {
    return `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  const CATEGORY_ICONS = {
    Design: "grid",
    Music: "music",
    Technology: "cpu",
    Food: "cooking",
    Travel: "plane",
    Live: "live",
    Podcasts: "podcast",
    Gaming: "gamepad",
    Learning: "book",
  };

  const SECTION_META = {
    home: {
      eyebrow: "Your library",
      title: "For you",
      emptyTitle: "Nothing here yet",
      emptyBody: "Try a different filter, or clear your search to see the full library.",
    },
    shorts: {
      eyebrow: "Short form",
      title: "Shorts",
      emptyTitle: "No shorts yet",
      emptyBody:
        "Vertical clips will live here. Add a shorts collection to data.js when you are ready.",
      filter: () => false,
    },
    subscriptions: {
      eyebrow: "Channels you follow",
      title: "Subscriptions",
      emptyTitle: "No subscriptions yet",
      emptyBody:
        "Subscribe to a channel and its newest videos will show up here.",
      filter: (video) => state.subscribed.has(video.channel),
    },
    history: {
      eyebrow: "Pick up where you left off",
      title: "History",
      emptyTitle: "Your history is empty",
      emptyBody: "Videos you start will appear here with a progress bar.",
      filter: (video) => progressFor(video.id) > 0,
    },
    playlists: {
      eyebrow: "Collections",
      title: "Playlists",
      emptyTitle: "No playlists yet",
      emptyBody: "Group videos into a playlist and they will show up here.",
      filter: () => false,
    },
    saved: {
      eyebrow: "Saved for later",
      title: "Watch later",
      emptyTitle: "Nothing saved yet",
      emptyBody:
        "Use the menu on any video card to save it to Watch later.",
      filter: (video) => state.saved.has(video.id),
    },
    liked: {
      eyebrow: "Your reactions",
      title: "Liked videos",
      emptyTitle: "No liked videos yet",
      emptyBody: "Tap the like button on a video and it will show up here.",
      filter: (video) => state.liked.has(video.id),
    },
    "your-videos": {
      eyebrow: "Your channel",
      title: "Your videos",
      emptyTitle: "No uploads yet",
      emptyBody: "Add a video with the Create button and it will appear here.",
      filter: (video) => video.id.startsWith("user-"),
    },
  };

  const SAMPLE_COMMENTS = [
    {
      name: "Mara K.",
      initials: "MK",
      color: "#3c5a74",
      time: "2 hours ago",
      text: "The pacing on this one is perfect. I kept waiting for the obvious edit and it never came.",
      likes: 24,
    },
    {
      name: "Theo Alvarez",
      initials: "TA",
      color: "#7a4b2d",
      time: "5 hours ago",
      text: "Came for the thumbnail, stayed for the last two minutes. That ending is doing a lot of quiet work.",
      likes: 11,
    },
    {
      name: "Nia Park",
      initials: "NP",
      color: "#4f5f35",
      time: "1 day ago",
      text: "The part about editing the choices before adding another toggle is going straight into my notes.",
      likes: 7,
    },
  ];

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[character];
    });
  }

  function formatCount(value) {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(value >= 10000000 ? 0 : 1).replace(".0", "")}M`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1).replace(".0", "")}K`;
    }
    return String(value);
  }

  function hydrateStaticIcons(root = document) {
    $$("[data-icon]", root).forEach((node) => {
      const extra = [node.dataset.iconClass, ...node.classList].filter(Boolean).join(" ");
      node.outerHTML = icon(node.dataset.icon, extra);
    });
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    el.themeBtn.innerHTML = icon(theme === "dark" ? "sun" : "moon");
    el.themeBtn.setAttribute(
      "aria-label",
      theme === "dark" ? "Switch to light appearance" : "Switch to dark appearance",
    );
    if (el.profileThemeLabel) {
      el.profileThemeLabel.textContent = theme === "dark" ? "Dark" : "Light";
    }
    const themeColor = $('meta[name="theme-color"]');
    if (themeColor) {
      themeColor.setAttribute("content", theme === "dark" ? "#0f0f0d" : "#f5f5f3");
    }
    persistValue(STORAGE.theme, theme);
  }

  function initialTheme() {
    const stored = readValue(STORAGE.theme);
    if (stored === "dark" || stored === "light") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyDensity() {
    document.body.classList.toggle("compact-grid", state.compact);
    el.densityBtn.setAttribute("aria-pressed", String(state.compact));
  }

  function filteredVideos() {
    const meta = SECTION_META[state.section] || SECTION_META.home;
    let list = library().filter((video) => !state.hidden.has(video.id));

    if (meta.filter) list = list.filter(meta.filter);
    if (state.channel) list = list.filter((video) => video.channel === state.channel);
    if (state.category !== "All") {
      list = list.filter((video) => video.category === state.category);
    }

    const query = state.query.trim().toLowerCase();
    if (query) {
      list = list.filter((video) => {
        return [video.title, video.channel, video.category, ...video.tags]
          .join(" ")
          .toLowerCase()
          .includes(query);
      });
    }

    return list;
  }

  function feedHeading() {
    if (state.query) return `Results for “${state.query}”`;
    if (state.channel) return state.channel;
    if (state.category !== "All") return state.category;
    return (SECTION_META[state.section] || SECTION_META.home).title;
  }

  function feedEyebrow() {
    if (state.query) return "Search";
    if (state.channel) return "Channel";
    if (state.category !== "All") return "Explore";
    return (SECTION_META[state.section] || SECTION_META.home).eyebrow;
  }

  function renderChips() {
    el.chips.innerHTML = window.VISTA_CATEGORIES.map((category) => {
      const active = category === state.category && !state.query && !state.channel;
      return `<button class="chip${active ? " is-active" : ""}" type="button" role="tab" aria-selected="${active}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`;
    }).join("");
  }

  function updateChips() {
    $$(".chip", el.chips).forEach((chip) => {
      const active = chip.dataset.category === state.category && !state.query && !state.channel;
      chip.classList.toggle("is-active", active);
      chip.setAttribute("aria-selected", String(active));
    });
  }

  function updateNav() {
    const effective = state.watching
      ? null
      : state.query || state.channel || state.category !== "All"
        ? "home"
        : state.section;

    $$("[data-section]").forEach((item) => {
      const active = item.dataset.section === effective;
      item.classList.toggle("is-active", active);
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });

    $$(".sidebar [data-category]").forEach((item) => {
      const active =
        !state.watching &&
        state.section === "home" &&
        !state.query &&
        !state.channel &&
        item.dataset.category === state.category;
      item.classList.toggle("is-active", active);
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });

    $$(".channel-link").forEach((item) => {
      item.classList.toggle("is-active", item.dataset.channel === state.channel);
    });
  }

  function cardHTML(video, index) {
    const saved = state.saved.has(video.id);
    const title = escapeHtml(video.title);
    const channel = escapeHtml(video.channel);
    const category = escapeHtml(video.category);
    const watchHref = `#watch/${encodeURIComponent(video.id)}`;
    const categoryIcon = CATEGORY_ICONS[video.category] || video.glyph || "film";
    const meta = video.live ? video.views : `${video.views} · ${video.age}`;
    const poster = posterFor(video);
    const watched = progressFor(video.id);
    const duration = video.duration || formatTime(video.length || 0);
    const playable = Boolean(sourceFor(video));

    return `
      <article class="video-card" data-id="${video.id}" style="--i: ${index}">
        <a class="thumb-link" href="${watchHref}" aria-label="Watch ${title}">
          <div class="thumb art--${video.pattern}${poster ? " thumb--poster" : ""}" style="--a: ${video.palette[0]}; --b: ${video.palette[1]}; --c: ${video.palette[2]}">
            ${poster ? `<img class="thumb__img" src="${escapeHtml(poster)}" alt="" loading="lazy" />` : ""}
            <span class="thumb__glyph">${icon(categoryIcon)}</span>
            <span class="thumb__tag">${category}</span>
            ${
              video.live
                ? '<span class="thumb__live"><span class="live-dot"></span>Live</span>'
                : duration
                  ? `<span class="thumb__time">${escapeHtml(duration)}</span>`
                  : ""
            }
            ${playable ? `<span class="thumb__play">${icon("play")}</span>` : ""}
            ${
              watched
                ? `<span class="thumb__progress"><span style="width: ${watched}%"></span></span>`
                : ""
            }
          </div>
        </a>
        <div class="card-body">
          <a class="avatar avatar--sm" href="${watchHref}" style="--avatar-bg: ${video.channelColor}" aria-label="${channel}">${escapeHtml(video.initials)}</a>
          <div class="card-copy">
            <a class="card-title" href="${watchHref}">${title}</a>
            <button class="card-channel" type="button" data-channel="${channel}">
              ${channel}${video.verified ? icon("check", "icon--verified") : ""}
            </button>
            <p class="card-stats">${escapeHtml(meta)}</p>
          </div>
          <button class="card-more icon-btn icon-btn--small" type="button" aria-label="More actions for ${title}" aria-haspopup="menu" aria-expanded="false" aria-controls="menu-${video.id}" data-menu="${video.id}">
            ${icon("more")}
          </button>
        </div>
        <div class="card-menu" id="menu-${video.id}" role="menu" hidden>
          <button type="button" role="menuitem" data-menu-action="save" data-id="${video.id}">
            ${icon(saved ? "check" : "clock")}<span>${saved ? "Remove from Watch later" : "Save to Watch later"}</span>
          </button>
          <button type="button" role="menuitem" data-menu-action="share" data-id="${video.id}">
            ${icon("link")}<span>Copy link</span>
          </button>
          <button type="button" role="menuitem" data-menu-action="hide" data-id="${video.id}">
            ${icon("eye")}<span>Not interested</span>
          </button>
          ${
            video.id.startsWith("user-")
              ? `<button type="button" role="menuitem" class="menu-danger" data-menu-action="delete" data-id="${video.id}">
            ${icon("trash")}<span>Remove from library</span>
          </button>`
              : ""
          }
        </div>
      </article>
    `;
  }

  function emptyCopy() {
    if (state.query) {
      return {
        title: "No matches",
        body: `Nothing in your library matches “${state.query}”. Try a shorter phrase or browse everything.`,
        action: "Clear search",
      };
    }
    if (state.channel) {
      return {
        title: "Nothing from this channel",
        body: `There are no videos from ${state.channel} in this view.`,
        action: "Show all videos",
      };
    }
    if (state.category !== "All") {
      return {
        title: "Nothing in this category",
        body: `There are no ${state.category.toLowerCase()} videos in this view yet.`,
        action: "Show all videos",
      };
    }
    const meta = SECTION_META[state.section] || SECTION_META.home;
    return {
      title: meta.emptyTitle,
      body: meta.emptyBody,
      action: "Browse the library",
    };
  }

  function renderFeed() {
    const list = filteredVideos();
    el.feedTitle.textContent = feedHeading();
    el.feedEyebrow.textContent = feedEyebrow();
    el.feedCount.textContent = `${list.length} ${list.length === 1 ? "video" : "videos"}`;
    el.videoGrid.innerHTML = list.map(cardHTML).join("");
    el.videoGrid.hidden = list.length === 0;
    el.emptyState.hidden = list.length !== 0;

    if (list.length === 0) {
      const copy = emptyCopy();
      el.emptyTitle.textContent = copy.title;
      el.emptyBody.textContent = copy.body;
      el.emptyAction.textContent = copy.action;
    }

    updateChips();
    updateNav();
  }

  function commentsHTML(comments) {
    return comments
      .map((comment) => {
        return `
          <article class="comment">
            <span class="avatar avatar--sm" style="--avatar-bg: ${comment.color}">${escapeHtml(comment.initials)}</span>
            <div>
              <p class="comment__meta"><strong>${escapeHtml(comment.name)}</strong><span>${escapeHtml(comment.time)}</span></p>
              <p class="comment__text">${escapeHtml(comment.text)}</p>
              <div class="comment__actions">
                <button type="button" data-toast="Comment likes are a placeholder.">Like</button>
                <span>${escapeHtml(String(comment.likes || 0))}</span>
                <button type="button" data-toast="Replies are a placeholder.">Reply</button>
              </div>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function relatedHTML(video) {
    const watchHref = `#watch/${encodeURIComponent(video.id)}`;
    const category = escapeHtml(video.category);
    const title = escapeHtml(video.title);
    const poster = posterFor(video);
    return `
      <a class="related-card" href="${watchHref}">
        <div class="related-thumb art--${video.pattern}${poster ? " related-thumb--poster" : ""}" style="--a: ${video.palette[0]}; --b: ${video.palette[1]}; --c: ${video.palette[2]}">
          ${poster ? `<img class="thumb__img" src="${escapeHtml(poster)}" alt="" loading="lazy" />` : ""}
          <span class="thumb__tag">${category}</span>
          ${
            video.live
              ? '<span class="thumb__live"><span class="live-dot"></span>Live</span>'
              : video.duration
                ? `<span class="thumb__time">${escapeHtml(video.duration)}</span>`
                : ""
          }
        </div>
        <div>
          <h3>${title}</h3>
          <p>${escapeHtml(video.channel)}</p>
          <p>${escapeHtml(video.live ? video.views : `${video.views} · ${video.age}`)}</p>
        </div>
      </a>
    `;
  }

  function playerHTML(video) {
    const src = sourceFor(video);
    const poster = posterFor(video);

    if (!src) {
      return `
        <div class="player__art art--${video.pattern}" style="--a: ${video.palette[0]}; --b: ${video.palette[1]}; --c: ${video.palette[2]}"></div>
        <div class="player__shade"></div>
        <div class="player__empty-copy">
          <strong>No stream attached</strong>
          <span>This entry is a live placeholder. Paste a direct stream URL to make it play.</span>
          <button class="btn btn--accent" type="button" data-watch-action="attach">Attach a stream</button>
        </div>
      `;
    }

    return `
      <video
        class="player__video"
        id="realVideo"
        preload="metadata"
        playsinline
        ${poster ? `poster="${escapeHtml(poster)}"` : ""}
        ${canCapture(src) && /^https?:/i.test(src) ? 'crossorigin="anonymous"' : ""}
      >
        <source src="${escapeHtml(src)}" />
      </video>

      <div class="player__bigplay" id="bigPlay" data-watch-action="toggle" role="presentation">
        <button type="button" tabindex="-1" aria-label="Play">${icon("play")}</button>
      </div>

      <div class="player__bar">
        <input class="player__seek" id="seekBar" type="range" min="0" max="1000" value="0" step="1" aria-label="Seek" />
        <div class="player__row">
          <button class="player__btn" id="playBtn" type="button" data-watch-action="toggle" aria-label="Play">${icon("play")}</button>
          <button class="player__btn" id="muteBtn" type="button" data-watch-action="mute" aria-label="Mute">${icon("volume")}</button>
          <input class="player__vol" id="volBar" type="range" min="0" max="100" value="100" step="1" aria-label="Volume" />
          <span class="player__clock"><span id="curTime">0:00</span> / <span id="durTime">${video.live ? "LIVE" : "0:00"}</span></span>
          <span class="player__spacer"></span>
          <button class="player__btn player__rate" id="rateBtn" type="button" data-watch-action="rate" aria-label="Playback speed">1×</button>
          <button class="player__btn" id="pipBtn" type="button" data-watch-action="pip" aria-label="Picture in picture">${icon("film")}</button>
          <button class="player__btn" id="fsBtn" type="button" data-watch-action="fullscreen" aria-label="Fullscreen">${icon("fullscreen")}</button>
        </div>
      </div>
    `;
  }

  function watchDetailHTML(video) {
    const liked = state.liked.has(video.id);
    const disliked = state.disliked.has(video.id);
    const saved = state.saved.has(video.id);
    const subscribed = state.subscribed.has(video.channel);
    const tags = video.tags
      .map((tag) => `#${escapeHtml(tag.replace(/\s+/g, ""))}`)
      .join(" ");
    const likeLabel = formatCount(video.likeCount + (liked ? 1 : 0));
    const comments = state.comments[video.id] || SAMPLE_COMMENTS;

    return `
      <div class="watch__topline">
        <button class="back-btn" type="button" data-watch-action="back">
          ${icon("arrowLeft")}<span>Back to feed</span>
        </button>
        <span class="watch-kicker">Now playing</span>
      </div>

      <div class="player" id="watchPlayer" data-video-id="${video.id}">
        ${playerHTML(video)}
      </div>

      <header class="watch-head">
        <h1>${escapeHtml(video.title)}</h1>
        <div class="watch-sub">
          <span>${escapeHtml(video.views)}</span>
          <span class="meta-dot"></span>
          <span>${escapeHtml(video.age)}</span>
          <span class="meta-dot"></span>
          <span>${escapeHtml(video.category)}</span>
        </div>
      </header>

      <div class="watch-actions">
        <span class="pill-group">
          <button class="pill${liked ? " is-active" : ""}" type="button" data-watch-action="like" aria-pressed="${liked}">
            ${icon("thumbUp")}<span>${likeLabel}</span>
          </button>
          <button class="pill${disliked ? " is-active" : ""}" type="button" data-watch-action="dislike" aria-pressed="${disliked}" aria-label="Dislike">
            ${icon("thumbDown")}
          </button>
        </span>
        <button class="pill" type="button" data-watch-action="share">${icon("share")}<span>Share</span></button>
        <button class="pill${saved ? " is-active" : ""}" type="button" data-watch-action="save">
          ${icon("save")}<span>${saved ? "Saved" : "Save"}</span>
        </button>
        <button class="pill pill--icon" type="button" data-watch-action="more" aria-label="More actions">${icon("more")}</button>
      </div>

      <div class="channel-row">
        <div class="channel-id">
          <span class="avatar" style="--avatar-bg: ${video.channelColor}">${escapeHtml(video.initials)}</span>
          <div class="channel-id__copy">
            <span class="channel-name">${escapeHtml(video.channel)}${video.verified ? icon("check", "icon--verified") : ""}</span>
            <p class="channel-meta">${escapeHtml(video.subscribers)} subscribers</p>
          </div>
        </div>
        <div class="channel-actions">
          <button class="subscribe-btn${subscribed ? " is-subscribed" : ""}" type="button" data-watch-action="subscribe">
            ${subscribed ? "Subscribed" : "Subscribe"}
          </button>
          <button class="icon-btn icon-btn--bordered" type="button" data-toast="Channel notifications are a placeholder." aria-label="Channel notifications">${icon("bell")}</button>
        </div>
      </div>

      <div class="description">
        <div class="description__stats">${escapeHtml(video.views)} · ${escapeHtml(video.age)}</div>
        <p class="description__text" id="watchDescription">${escapeHtml(video.description)}</p>
        <span class="description__tags">${tags}</span>
        <button class="description__toggle" type="button" data-watch-action="expand" aria-expanded="false">Show more</button>
      </div>

      <section class="comments" aria-labelledby="commentsTitle">
        <div class="comments__head">
          <h2 id="commentsTitle"><span id="commentCount">${comments.length}</span> Comments</h2>
          <button type="button" data-toast="Comment sorting is a placeholder.">Sort by ${icon("chevronDown")}</button>
        </div>
        <form class="comment-form" id="commentForm">
          <span class="avatar avatar--sm avatar--me">JD</span>
          <input id="commentInput" type="text" maxlength="300" placeholder="Add a comment..." aria-label="Add a comment" />
          <button class="btn btn--dark" type="submit">Comment</button>
        </form>
        <div class="comment-list" id="commentList">${commentsHTML(comments)}</div>
      </section>
    `;
  }

  function renderWatch(video) {
    stopPlayback();
    const related = library().filter(
      (item) => item.id !== video.id && !state.hidden.has(item.id),
    )
      .sort((a, b) => Number(b.category === video.category) - Number(a.category === video.category))
      .slice(0, 8);

    el.watchMain.innerHTML = watchDetailHTML(video);
    setupPlayer(video);
    el.watchRail.innerHTML = `
      <div class="rail-head">
        <h2>Up next</h2>
        <button class="autoplay" type="button" data-watch-action="autoplay" aria-pressed="${state.autoplay}">
          <span>Autoplay</span><span class="switch${state.autoplay ? " is-on" : ""}"></span>
        </button>
      </div>
      <div class="related-list">
        ${related.length ? related.map(relatedHTML).join("") : '<p class="empty-copy">No more videos in this view.</p>'}
      </div>
    `;
  }

  function setupPlayer(video) {
    const player = $("#watchPlayer", el.watchMain);
    const media = $("#realVideo", el.watchMain);
    if (!player || !media) return;

    const seek = $("#seekBar", player);
    const vol = $("#volBar", player);
    const playBtn = $("#playBtn", player);
    const muteBtn = $("#muteBtn", player);
    const rateBtn = $("#rateBtn", player);
    const bigPlay = $("#bigPlay", player);
    const curTime = $("#curTime", player);
    const durTime = $("#durTime", player);

    const RATES = [1, 1.25, 1.5, 1.75, 2, 0.75, 0.5];

    const storedVol = Number(readValue(STORAGE.volume) ?? 100);
    const startVol = isFinite(storedVol) ? Math.min(100, Math.max(0, storedVol)) : 100;
    media.volume = startVol / 100;
    if (vol) vol.value = String(startVol);

    const storedRate = Number(readValue(STORAGE.rate) ?? 1);
    const startRate = RATES.includes(storedRate) ? storedRate : 1;
    media.playbackRate = startRate;

    const paintVolume = () => {
      if (vol) vol.style.setProperty("--played", `${(media.muted ? 0 : media.volume) * 100}%`);
      if (muteBtn) {
        muteBtn.classList.toggle("is-active", media.muted || media.volume === 0);
        muteBtn.setAttribute("aria-label", media.muted || media.volume === 0 ? "Unmute" : "Mute");
      }
    };

    const paintPlayState = () => {
      const paused = media.paused;
      player.classList.toggle("is-paused", paused);
      if (bigPlay) bigPlay.hidden = !paused;
      if (playBtn) {
        playBtn.innerHTML = icon(paused ? "play" : "pause");
        playBtn.setAttribute("aria-label", paused ? "Play" : "Pause");
      }
      const bigButton = bigPlay && bigPlay.querySelector("button");
      if (bigButton) bigButton.setAttribute("aria-label", paused ? "Play" : "Pause");
    };

    const paintRate = () => {
      if (rateBtn) rateBtn.textContent = `${media.playbackRate}×`;
    };

    const paintTime = () => {
      const duration = isFinite(media.duration) ? media.duration : 0;
      if (curTime) curTime.textContent = formatTime(media.currentTime);
      if (durTime) durTime.textContent = duration ? formatTime(duration) : "0:00";

      const playedPct = duration ? (media.currentTime / duration) * 100 : 0;
      if (seek) {
        seek.value = String(Math.round(playedPct * 10));
        seek.style.setProperty("--played", `${playedPct}%`);
      }

      if (media.buffered.length) {
        const bufferedEnd = media.buffered.end(media.buffered.length - 1);
        const bufferedPct = duration ? (bufferedEnd / duration) * 100 : 0;
        if (seek) seek.style.setProperty("--buffered", `${bufferedPct}%`);
      }
    };

    paintVolume();
    paintPlayState();
    paintRate();
    paintTime();

    // If the stream never arrives, say so instead of showing a dead play button.
    const loadTimer = window.setTimeout(() => {
      if (media.readyState === 0 && !media.error) showPlayerError(video);
    }, 15000);

    media.addEventListener("loadedmetadata", () => window.clearTimeout(loadTimer), { once: true });

    media.addEventListener("error", () => {
      window.clearTimeout(loadTimer);
      showPlayerError(video);
    }, { once: true });

    // Resume where the viewer left off.
    media.addEventListener(
      "loadedmetadata",
      () => {
        paintTime();
        const saved = state.progress[video.id];
        if (saved && saved.t > 3 && saved.d - saved.t > 4) {
          media.currentTime = saved.t;
          toast(`Resumed at ${formatTime(saved.t)}.`);
        }
        // Keep the card's duration honest once we know the real value.
        if (isFinite(media.duration) && media.duration > 0) {
          const entry = library().find((item) => item.id === video.id);
          if (entry) entry.length = media.duration;
        }
      },
      { once: true },
    );

    let lastSave = 0;
    media.addEventListener("timeupdate", () => {
      paintTime();
      const now = performance.now();
      if (now - lastSave > 1000) {
        lastSave = now;
        saveProgress(video.id, media.currentTime, media.duration);
      }
    });

    media.addEventListener("play", paintPlayState);
    media.addEventListener("pause", paintPlayState);
    media.addEventListener("ended", () => {
      paintPlayState();
      saveProgress(video.id, 0, media.duration);
      if (state.autoplay) playNext();
    });
    media.addEventListener("volumechange", paintVolume);
    media.addEventListener("ratechange", paintRate);
    media.addEventListener("click", () => {
      if (media.paused) media.play().catch(() => {});
      else media.pause();
    });

    if (seek) {
      seek.addEventListener("input", () => {
        const duration = isFinite(media.duration) ? media.duration : 0;
        if (!duration) return;
        media.currentTime = (Number(seek.value) / 1000) * duration;
        paintTime();
      });
    }

    if (vol) {
      vol.addEventListener("input", () => {
        const value = Number(vol.value);
        media.volume = value / 100;
        media.muted = value === 0;
        persistValue(STORAGE.volume, String(value));
        paintVolume();
      });
    }

    // Pull a real frame out of the video and use it as the thumbnail.
    if (!posterFor(video) && canCapture(sourceFor(video))) {
      const grab = () => {
        try {
          const canvas = document.createElement("canvas");
          const width = 480;
          const ratio = media.videoWidth ? media.videoHeight / media.videoWidth : 0.5625;
          canvas.width = width;
          canvas.height = Math.round(width * ratio) || 270;
          canvas.getContext("2d").drawImage(media, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
          savePoster(video.id, dataUrl);
          if (!media.getAttribute("poster")) media.setAttribute("poster", dataUrl);
        } catch {
          /* Frame is not readable; the CSS artwork stays. */
        }
      };
      if (media.readyState >= 2) grab();
      else media.addEventListener("loadeddata", grab, { once: true });
    }

    player.dataset.ready = "true";
  }

  function showPlayerError(video) {
    const player = $("#watchPlayer", el.watchMain);
    if (!player || player.dataset.failed === "true") return;
    player.dataset.failed = "true";
    player.classList.add("is-failed");

    const notice = document.createElement("div");
    notice.className = "player__error";
    notice.innerHTML = `
      <strong>This stream did not load</strong>
      <span>The link may be offline, or it blocks embedding. Paste a direct MP4 or WebM URL instead.</span>
      <button class="btn btn--accent" type="button" data-watch-action="attach">Use a different source</button>
    `;
    player.appendChild(notice);
  }

  function playNext() {
    const current = state.watching;
    if (!current) return;
    const next = library().find(
      (item) => item.id !== current.id && sourceFor(item) && !state.hidden.has(item.id),
    );
    if (!next) return;
    toast(`Up next: ${next.title}`);
    location.hash = `watch/${encodeURIComponent(next.id)}`;
  }

  function renderCommentList(video) {
    const list = state.comments[video.id] || SAMPLE_COMMENTS;
    const listNode = $("#commentList");
    const countNode = $("#commentCount");
    if (listNode) listNode.innerHTML = commentsHTML(list);
    if (countNode) countNode.textContent = list.length;
  }

  function showHome() {
    stopPlayback();
    state.watching = null;
    el.watchView.hidden = true;
    el.homeView.hidden = false;
    document.body.classList.remove("is-watching");
    document.title = "Vista · Your library";
    renderFeed();
    updateNav();
  }

  function goHome() {
    if (location.hash && location.hash !== "#/") {
      history.replaceState(null, "", "#/");
    }
    showHome();
  }

  function openWatch(id) {
    const video = library().find((item) => item.id === id);
    if (!video) {
      goHome();
      toast("That video is not in the placeholder library.");
      return;
    }

    state.watching = video;
    el.homeView.hidden = true;
    el.watchView.hidden = false;
    document.body.classList.add("is-watching");
    document.title = `${video.title} · Vista`;
    renderWatch(video);
    updateNav();
    closePopovers();
    closeSidebar();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function handleHash() {
    const match = location.hash.match(/^#watch\/(.+)$/);
    if (match) {
      openWatch(decodeURIComponent(match[1]));
      return;
    }
    showHome();
  }

  function toast(message) {
    const node = document.createElement("div");
    node.className = "toast";
    node.innerHTML = icon("sparkles");
    const copy = document.createElement("span");
    copy.textContent = message;
    node.append(copy);
    el.toastStack.append(node);
    if (el.toastStack.children.length > 3) el.toastStack.firstElementChild.remove();
    window.setTimeout(() => {
      node.classList.add("is-leaving");
      window.setTimeout(() => node.remove(), 220);
    }, 2800);
  }

  function closePopovers() {
    el.notifPanel.hidden = true;
    el.profilePanel.hidden = true;
    el.notifBtn.setAttribute("aria-expanded", "false");
    el.profileBtn.setAttribute("aria-expanded", "false");
  }

  function togglePopover(panel, button) {
    const willOpen = panel.hidden;
    closePopovers();
    if (willOpen) {
      panel.hidden = false;
      button.setAttribute("aria-expanded", "true");
    }
  }

  function closeMenus() {
    $$(".card-menu").forEach((menu) => {
      menu.hidden = true;
    });
    $$("[data-menu]").forEach((button) => {
      button.setAttribute("aria-expanded", "false");
    });
  }

  function toggleCardMenu(button) {
    const menu = document.getElementById(`menu-${button.dataset.menu}`);
    const willOpen = menu && menu.hidden;
    closeMenus();
    if (willOpen) {
      menu.hidden = false;
      button.setAttribute("aria-expanded", "true");
    }
  }

  function closeSidebar() {
    document.body.classList.remove("sidebar-open");
    el.sidebarScrim.hidden = true;
    el.menuBtn.setAttribute("aria-expanded", "false");
  }

  function toggleSidebar() {
    if (window.matchMedia("(max-width: 900px)").matches) {
      const open = document.body.classList.toggle("sidebar-open");
      el.sidebarScrim.hidden = !open;
      el.menuBtn.setAttribute("aria-expanded", String(open));
      return;
    }
    const collapsed = document.body.classList.toggle("sidebar-collapsed");
    persistValue(STORAGE.collapsed, String(collapsed));
    el.menuBtn.setAttribute("aria-expanded", String(!collapsed));
  }

  function setSection(section) {
    if (state.watching) goHome();
    state.section = section;
    state.category = "All";
    state.channel = null;
    state.query = "";
    el.searchInput.value = "";
    renderFeed();
    closeSidebar();
    closeMenus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setCategory(category) {
    if (state.watching) goHome();
    state.section = "home";
    state.category = category;
    state.channel = null;
    state.query = "";
    el.searchInput.value = "";
    renderFeed();
    closeSidebar();
    closeMenus();
  }

  function setChannel(channel) {
    if (state.watching) goHome();
    state.section = "home";
    state.category = "All";
    state.channel = channel;
    state.query = "";
    el.searchInput.value = "";
    renderFeed();
    closeSidebar();
    closeMenus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function clearView() {
    if (state.watching) goHome();
    state.section = "home";
    state.category = "All";
    state.channel = null;
    state.query = "";
    el.searchInput.value = "";
    renderFeed();
    closeMenus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function runSearch() {
    if (state.watching) goHome();
    state.query = el.searchInput.value.trim();
    state.section = "home";
    state.category = "All";
    state.channel = null;
    renderFeed();
    closeSidebar();
    closeMenus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(text)
        .then(() => toast("Link copied."))
        .catch(() => toast("Copy was blocked. Use the address bar instead."));
      return;
    }
    toast("Copy is unavailable here. Use the address bar instead.");
  }

  function copyVideoLink(id) {
    const url = new URL(location.href);
    url.hash = `watch/${id}`;
    copyText(url.href);
  }

  function updateLikeUI(video) {
    const liked = state.liked.has(video.id);
    const disliked = state.disliked.has(video.id);
    const likeButton = $('[data-watch-action="like"]', el.watchMain);
    const dislikeButton = $('[data-watch-action="dislike"]', el.watchMain);
    if (likeButton) {
      likeButton.classList.toggle("is-active", liked);
      likeButton.setAttribute("aria-pressed", String(liked));
      const count = likeButton.querySelector("span");
      if (count) count.textContent = formatCount(video.likeCount + (liked ? 1 : 0));
    }
    if (dislikeButton) {
      dislikeButton.classList.toggle("is-active", disliked);
      dislikeButton.setAttribute("aria-pressed", String(disliked));
    }
  }

  function updateSaveUI(video) {
    const saved = state.saved.has(video.id);
    const button = $('[data-watch-action="save"]', el.watchMain);
    if (!button) return;
    button.classList.toggle("is-active", saved);
    const label = button.querySelector("span");
    if (label) label.textContent = saved ? "Saved" : "Save";
  }

  function updateSubscribeUI(video) {
    const subscribed = state.subscribed.has(video.channel);
    const button = $('[data-watch-action="subscribe"]', el.watchMain);
    if (!button) return;
    button.classList.toggle("is-subscribed", subscribed);
    button.textContent = subscribed ? "Subscribed" : "Subscribe";
  }

  function currentMedia() {
    return $("#realVideo", el.watchMain);
  }

  function stopPlayback() {
    const media = currentMedia();
    if (media && !media.paused) media.pause();
  }

  function togglePlayback() {
    const media = currentMedia();
    if (!media) return;
    if (media.paused) media.play().catch(() => toast("This browser blocked playback."));
    else media.pause();
  }

  function toggleMute() {
    const media = currentMedia();
    if (!media) return;
    media.muted = !media.muted;
    if (!media.muted && media.volume === 0) media.volume = 0.6;
  }

  function cycleRate() {
    const media = currentMedia();
    if (!media) return;
    const rates = [1, 1.25, 1.5, 1.75, 2, 0.75, 0.5];
    const next = rates[(rates.indexOf(media.playbackRate) + 1) % rates.length] ?? 1;
    media.playbackRate = next;
    persistValue(STORAGE.rate, String(next));
  }

  async function togglePip() {
    const media = currentMedia();
    if (!media) return;
    if (!document.pictureInPictureEnabled) {
      toast("Picture-in-picture is not supported here.");
      return;
    }
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await media.requestPictureInPicture();
    } catch {
      toast("Picture-in-picture was blocked.");
    }
  }

  async function toggleFullscreen() {
    const player = $("#watchPlayer", el.watchMain);
    if (!player) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await player.requestFullscreen();
    } catch {
      toast("Fullscreen was blocked.");
    }
  }

  function handleWatchAction(action) {
    const video = state.watching;
    if (!video) return;

    if (action === "back") {
      goHome();
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }

    if (action === "toggle") {
      togglePlayback();
      return;
    }

    if (action === "mute") {
      toggleMute();
      return;
    }

    if (action === "rate") {
      cycleRate();
      return;
    }

    if (action === "pip") {
      togglePip();
      return;
    }

    if (action === "fullscreen") {
      toggleFullscreen();
      return;
    }

    if (action === "attach") {
      openCreateDialog("url");
      return;
    }

    if (action === "like") {
      if (state.liked.has(video.id)) state.liked.delete(video.id);
      else state.liked.add(video.id);
      state.disliked.delete(video.id);
      persistSet(STORAGE.liked, state.liked);
      persistSet(STORAGE.disliked, state.disliked);
      updateLikeUI(video);
      renderFeed();
      return;
    }

    if (action === "dislike") {
      if (state.disliked.has(video.id)) state.disliked.delete(video.id);
      else state.disliked.add(video.id);
      state.liked.delete(video.id);
      persistSet(STORAGE.liked, state.liked);
      persistSet(STORAGE.disliked, state.disliked);
      updateLikeUI(video);
      renderFeed();
      return;
    }

    if (action === "share") {
      copyVideoLink(video.id);
      return;
    }

    if (action === "save") {
      if (state.saved.has(video.id)) state.saved.delete(video.id);
      else state.saved.add(video.id);
      persistSet(STORAGE.saved, state.saved);
      updateSaveUI(video);
      renderFeed();
      toast(state.saved.has(video.id) ? "Saved to Watch later." : "Removed from Watch later.");
      return;
    }

    if (action === "subscribe") {
      if (state.subscribed.has(video.channel)) state.subscribed.delete(video.channel);
      else state.subscribed.add(video.channel);
      persistSet(STORAGE.subscribed, state.subscribed);
      updateSubscribeUI(video);
      toast(
        state.subscribed.has(video.channel)
          ? `Subscribed to ${video.channel}.`
          : `Unsubscribed from ${video.channel}.`,
      );
      return;
    }

    if (action === "expand") {
      const text = $("#watchDescription", el.watchMain);
      const button = $('[data-watch-action="expand"]', el.watchMain);
      if (!text || !button) return;
      const expanded = text.classList.toggle("is-expanded");
      button.textContent = expanded ? "Show less" : "Show more";
      button.setAttribute("aria-expanded", String(expanded));
      return;
    }

    if (action === "autoplay") {
      state.autoplay = !state.autoplay;
      const button = $('[data-watch-action="autoplay"]', el.watchMain);
      if (button) {
        button.setAttribute("aria-pressed", String(state.autoplay));
        const toggle = button.querySelector(".switch");
        if (toggle) toggle.classList.toggle("is-on", state.autoplay);
      }
      toast(state.autoplay ? "Autoplay is on." : "Autoplay is off.");
      return;
    }

    if (action === "more") {
      toast("More actions are a placeholder.");
    }
  }

  function handleMenuAction(action, id) {
    const video = library().find((item) => item.id === id);
    if (!video) return;

    if (action === "save") {
      if (state.saved.has(id)) state.saved.delete(id);
      else state.saved.add(id);
      persistSet(STORAGE.saved, state.saved);
      closeMenus();
      renderFeed();
      if (state.watching && state.watching.id === id) updateSaveUI(state.watching);
      toast(state.saved.has(id) ? "Saved to Watch later." : "Removed from Watch later.");
      return;
    }

    if (action === "share") {
      closeMenus();
      copyVideoLink(id);
      return;
    }

    if (action === "hide") {
      state.hidden.add(id);
      closeMenus();
      if (state.watching && state.watching.id === id) goHome();
      renderFeed();
      toast("Hidden from this session. Refresh to bring it back.");
      return;
    }

    if (action === "delete") {
      closeMenus();
      removeUserVideo(id);
    }
  }

  async function removeUserVideo(id) {
    state.userVideos = state.userVideos.filter((item) => item.id !== id);
    writeJSON(
      STORAGE.added,
      state.userVideos.map(({ objectUrl, ...rest }) => rest),
    );

    const url = state.objectUrls.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      state.objectUrls.delete(id);
    }

    delete state.posters[id];
    writeJSON(STORAGE.posters, state.posters);
    delete state.progress[id];
    writeJSON(STORAGE.progress, state.progress);

    try {
      await deleteFile(id);
    } catch {
      /* Nothing stored, or storage is unavailable. */
    }

    if (state.watching && state.watching.id === id) goHome();
    renderFeed();
    toast("Removed from your library.");
  }

  function handleCommentSubmit(event) {
    event.preventDefault();
    const video = state.watching;
    if (!video) return;
    const input = $("#commentInput", el.watchMain);
    if (!input) return;
    const text = input.value.trim();
    if (!text) {
      input.focus();
      toast("Write a comment first.");
      return;
    }
    const list = state.comments[video.id] || SAMPLE_COMMENTS;
    state.comments[video.id] = [
      {
        name: "You",
        initials: "JD",
        color: "#2e4c8a",
        time: "Just now",
        text,
        likes: 0,
      },
      ...list,
    ];
    input.value = "";
    renderCommentList(video);
    toast("Comment added to the prototype.");
  }

  function updateNotifBadge() {
    const unread = $$(".unread-dot", el.notifPanel).filter((dot) => !dot.hidden).length;
    el.notifBadge.textContent = String(unread);
    el.notifBadge.hidden = unread === 0;
  }

  function isTyping(target) {
    return (
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable)
    );
  }

  function bindEvents() {
    const mobileQuery = window.matchMedia("(max-width: 900px)");

    el.menuBtn.addEventListener("click", toggleSidebar);
    el.sidebarScrim.addEventListener("click", closeSidebar);

    mobileQuery.addEventListener("change", () => {
      closeSidebar();
      if (mobileQuery.matches) {
        document.body.classList.remove("sidebar-collapsed");
      } else {
        document.body.classList.toggle(
          "sidebar-collapsed",
          readValue(STORAGE.collapsed) === "true",
        );
      }
    });

    el.searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      runSearch();
    });

    el.searchInput.addEventListener("input", () => {
      if (state.watching) return;
      state.query = el.searchInput.value.trim();
      state.section = "home";
      state.category = "All";
      state.channel = null;
      renderFeed();
    });

    el.searchInput.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      el.searchInput.value = "";
      if (state.query) {
        state.query = "";
        renderFeed();
      }
      el.searchInput.blur();
    });

    el.themeBtn.addEventListener("click", () => {
      applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    });

    el.densityBtn.addEventListener("click", () => {
      state.compact = !state.compact;
      persistValue(STORAGE.compact, String(state.compact));
      applyDensity();
      toast(state.compact ? "Compact grid on." : "Comfortable grid on.");
    });

    el.createBtn.addEventListener("click", () => openCreateDialog("file"));
    el.mobileCreateBtn.addEventListener("click", () => openCreateDialog("file"));
    el.closeCreateBtn.addEventListener("click", () => el.createDialog.close());
    el.cancelCreateBtn.addEventListener("click", () => el.createDialog.close());
    el.createDialog.addEventListener("click", (event) => {
      if (event.target === el.createDialog) el.createDialog.close();
    });

    el.addForm.addEventListener("submit", handleAddSubmit);

    el.addForm.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-add-tab]");
      if (tab) setAddTab(tab.dataset.addTab);
    });

    el.videoFile.addEventListener("change", () => {
      showPickedFile(el.videoFile.files[0]);
    });

    el.dropzone.addEventListener("dragover", (event) => {
      event.preventDefault();
      el.dropzone.classList.add("is-dragging");
    });

    el.dropzone.addEventListener("dragleave", () => {
      el.dropzone.classList.remove("is-dragging");
    });

    el.dropzone.addEventListener("drop", (event) => {
      event.preventDefault();
      el.dropzone.classList.remove("is-dragging");
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      if (el.videoFile.files && event.dataTransfer.files.length) {
        try {
          el.videoFile.files = event.dataTransfer.files;
        } catch {
          /* Some browsers refuse assignment; keep the dropped file in memory. */
        }
      }
      state.pendingFile = file;
      showPickedFile(file);
    });

    el.notifBtn.addEventListener("click", () => togglePopover(el.notifPanel, el.notifBtn));
    el.profileBtn.addEventListener("click", () => togglePopover(el.profilePanel, el.profileBtn));

    el.markReadBtn.addEventListener("click", () => {
      $$(".unread-dot", el.notifPanel).forEach((dot) => {
        dot.hidden = true;
      });
      updateNotifBadge();
      toast("All notifications marked read.");
    });

    el.notifPanel.addEventListener("click", (event) => {
      const notification = event.target.closest("[data-notif]");
      if (!notification) return;
      const dot = $(".unread-dot", notification);
      if (dot) dot.hidden = true;
      updateNotifBadge();
      closePopovers();
      toast("Notification opened in the prototype.");
    });

    document.addEventListener("click", (event) => {
      const section = event.target.closest("[data-section]");
      if (section) {
        setSection(section.dataset.section);
        return;
      }

      const category = event.target.closest("[data-category]");
      if (category) {
        setCategory(category.dataset.category);
        return;
      }

      const channel = event.target.closest("[data-channel]");
      if (channel) {
        setChannel(channel.dataset.channel);
        return;
      }

      const toastTarget = event.target.closest("[data-toast]");
      if (toastTarget) {
        toast(toastTarget.dataset.toast);
        if (toastTarget.closest(".popover")) closePopovers();
      }
    });

    el.videoGrid.addEventListener("click", (event) => {
      const menuButton = event.target.closest("[data-menu]");
      if (menuButton) {
        event.preventDefault();
        toggleCardMenu(menuButton);
        return;
      }

      const menuAction = event.target.closest("[data-menu-action]");
      if (menuAction) {
        event.preventDefault();
        handleMenuAction(menuAction.dataset.menuAction, menuAction.dataset.id);
      }
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest("[data-menu]") && !event.target.closest(".card-menu")) {
        closeMenus();
      }
      if (!event.target.closest(".popover-wrap")) {
        closePopovers();
      }
    });

    el.emptyAction.addEventListener("click", clearView);

    el.watchMain.addEventListener("click", (event) => {
      const action = event.target.closest("[data-watch-action]");
      if (!action) return;
      event.preventDefault();
      handleWatchAction(action.dataset.watchAction);
    });

    el.watchMain.addEventListener("submit", (event) => {
      if (event.target.id === "commentForm") handleCommentSubmit(event);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (el.createDialog.open) return;
        if (isTyping(event.target)) return;
        closePopovers();
        closeMenus();
        closeSidebar();
        if (state.watching) goHome();
        return;
      }

      if (event.key === "/" && !isTyping(event.target) && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        el.searchInput.focus();
      }
    });

    window.addEventListener("hashchange", handleHash);
  }

  /* ---------- Add video ---------- */

  function setAddTab(tab) {
    $$("[data-add-tab]").forEach((button) => {
      const active = button.dataset.addTab === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    $$("[data-add-pane]").forEach((pane) => {
      pane.hidden = pane.dataset.addPane !== tab;
    });
    el.addForm.dataset.tab = tab;
  }

  function setAddStatus(message, isError) {
    if (!el.addStatus) return;
    el.addStatus.hidden = !message;
    el.addStatus.textContent = message || "";
    el.addStatus.classList.toggle("is-error", Boolean(isError));
  }

  function showPickedFile(file) {
    if (!file) {
      state.pendingFile = null;
      el.dropzone.classList.remove("has-file");
      el.dropLabel.textContent = "Drop a video here";
      el.dropHint.textContent = "or click to choose — MP4, WebM, MOV, OGG";
      return;
    }
    state.pendingFile = file;
    el.dropzone.classList.add("has-file");
    el.dropLabel.textContent = file.name;
    const size = file.size >= 1048576
      ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(file.size / 1024))} KB`;
    el.dropHint.textContent = `${size} · ready to add`;
    if (el.videoTitle && !el.videoTitle.value.trim()) {
      el.videoTitle.value = file.name.replace(/\.[^.]+$/, "");
    }
  }

  async function handleAddSubmit(event) {
    event.preventDefault();
    if (el.addForm.dataset.busy === "true") return;

    const tab = el.addForm.dataset.tab || "file";
    el.addForm.dataset.busy = "true";
    el.addSubmit.disabled = true;

    try {
      if (tab === "url") {
        const url = el.videoUrl.value.trim();
        if (!url) {
          setAddStatus("Paste a video URL first.", true);
          return;
        }
        await addVideoFromUrl(url);
        return;
      }

      const file = state.pendingFile || el.videoFile.files[0];
      if (!file) {
        setAddStatus("Choose a file or drop one onto the box.", true);
        return;
      }
      await addVideoFromFile(file);
    } finally {
      el.addForm.dataset.busy = "false";
      el.addSubmit.disabled = false;
    }
  }

  function openCreateDialog(tab = "file") {
    closePopovers();
    closeMenus();
    setAddTab(tab);
    setAddStatus("");
    state.pendingFile = null;
    if (el.videoFile) el.videoFile.value = "";
    if (el.videoUrl) el.videoUrl.value = "";
    if (el.videoTitle) el.videoTitle.value = "";
    if (el.dropLabel) el.dropLabel.textContent = "Drop a video here";
    if (el.dropHint) el.dropHint.textContent = "or click to choose — MP4, WebM, MOV, OGG";
    el.dropzone?.classList.remove("has-file", "is-dragging");
    if (typeof el.createDialog.showModal === "function") {
      el.createDialog.showModal();
    } else {
      el.createDialog.setAttribute("open", "");
    }
  }

  function baseEntry(overrides) {
    return {
      id: makeId(),
      channel: "Your uploads",
      initials: "ME",
      channelColor: "#2e4c8a",
      verified: false,
      subscribers: "—",
      views: "New",
      age: "Just added",
      category: "Uploads",
      tags: ["upload", "local"],
      pattern: "frame",
      palette: ["#d7dee8", "#8fa4bd", "#28303d"],
      glyph: "film",
      likeCount: 0,
      description: "Added from your device. This file lives in this browser only.",
      ...overrides,
    };
  }

  function persistAdded() {
    writeJSON(
      STORAGE.added,
      state.userVideos.map((item) => ({
        id: item.id,
        title: item.title,
        kind: item.kind,
        src: item.kind === "url" ? item.src : "",
        length: item.length || 0,
        duration: item.duration || "",
        age: item.age,
        views: item.views,
        description: item.description,
      })),
    );
  }

  async function addVideoFromFile(file) {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setAddStatus("That file is not a video.", true);
      return;
    }

    setAddStatus("Reading video…");
    const objectUrl = URL.createObjectURL(file);
    const { duration, poster } = await probeMedia(objectUrl, true);

    const entry = baseEntry({
      id: makeId(),
      kind: "file",
      src: objectUrl,
      title: el.videoTitle?.value.trim() || file.name.replace(/\.[^.]+$/, "") || "Untitled video",
      length: duration,
      duration: duration ? formatTime(duration) : "",
      description: `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB. Stored in this browser.`,
    });

    try {
      await putFile(entry.id, file);
    } catch {
      setAddStatus("Saved for this session only — browser storage refused the file.", true);
    }

    state.objectUrls.set(entry.id, objectUrl);
    state.userVideos.unshift(entry);
    if (poster) savePoster(entry.id, poster);
    persistAdded();

    el.createDialog.close();
    renderFeed();
    toast(`Added “${entry.title}”.`);
    location.hash = `watch/${encodeURIComponent(entry.id)}`;
  }

  async function addVideoFromUrl(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      setAddStatus("That is not a valid URL.", true);
      return;
    }
    if (!/^https?:$/.test(parsed.protocol)) {
      setAddStatus("Only http and https links can be added.", true);
      return;
    }

    setAddStatus("Checking the link…");
    const capture = canCapture(url);
    const { duration, poster } = await probeMedia(url, capture);

    const entry = baseEntry({
      id: makeId(),
      kind: "url",
      src: url,
      title: el.videoTitle?.value.trim() || parsed.pathname.split("/").filter(Boolean).pop() || "Linked video",
      length: duration,
      duration: duration ? formatTime(duration) : "",
      description: `Linked from ${parsed.host}. Plays directly from that address.`,
    });

    state.userVideos.unshift(entry);
    if (poster) savePoster(entry.id, poster);
    persistAdded();

    el.createDialog.close();
    renderFeed();
    toast(duration ? `Added “${entry.title}”.` : "Added, but the browser could not read that video.");
    location.hash = `watch/${encodeURIComponent(entry.id)}`;
  }

  async function loadUserVideos() {
    const saved = readJSON(STORAGE.added, []);
    if (!Array.isArray(saved) || !saved.length) return;

    const restored = [];
    for (const item of saved) {
      const entry = baseEntry({
        id: item.id,
        kind: item.kind,
        title: item.title,
        length: item.length || 0,
        duration: item.duration || "",
        age: item.age || "Earlier",
        views: item.views || "—",
        description: item.description || "",
      });

      if (item.kind === "file") {
        const blob = await getFile(item.id).catch(() => null);
        if (!blob) continue;
        const objectUrl = URL.createObjectURL(blob);
        state.objectUrls.set(item.id, objectUrl);
        entry.src = objectUrl;
      } else {
        entry.src = item.src || "";
      }

      restored.push(entry);
    }

    state.userVideos = restored;
    renderFeed();
  }

  async function init() {
    hydrateStaticIcons();
    applyTheme(initialTheme());
    applyDensity();
    renderChips();
    renderFeed();
    updateNotifBadge();
    await loadUserVideos();
    hydrateDurations();

    if (
      window.matchMedia("(min-width: 901px)").matches &&
      readValue(STORAGE.collapsed) === "true"
    ) {
      document.body.classList.add("sidebar-collapsed");
    }

    el.notifBtn.setAttribute("aria-expanded", "false");
    el.profileBtn.setAttribute("aria-expanded", "false");
    el.menuBtn.setAttribute("aria-expanded", "false");
    bindEvents();
    handleHash();
  }

  init();
})();
