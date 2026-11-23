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
  };

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
  };

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
      filter: (video) => Boolean(video.progress),
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
      emptyBody: "Uploaded videos will appear here once you connect your library.",
      filter: () => false,
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
    let list = window.VIDEO_DATA.filter((video) => !state.hidden.has(video.id));

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

    return `
      <article class="video-card" data-id="${video.id}" style="--i: ${index}">
        <a class="thumb-link" href="${watchHref}" aria-label="Watch ${title}">
          <div class="thumb art--${video.pattern}" style="--a: ${video.palette[0]}; --b: ${video.palette[1]}; --c: ${video.palette[2]}">
            <span class="thumb__glyph">${icon(categoryIcon)}</span>
            <span class="thumb__tag">${category}</span>
            ${
              video.live
                ? '<span class="thumb__live"><span class="live-dot"></span>Live</span>'
                : `<span class="thumb__time">${escapeHtml(video.duration)}</span>`
            }
            <span class="thumb__play">${icon("play")}</span>
            ${
              video.progress
                ? `<span class="thumb__progress"><span style="width: ${Number(video.progress)}%"></span></span>`
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
    return `
      <a class="related-card" href="${watchHref}">
        <div class="related-thumb art--${video.pattern}" style="--a: ${video.palette[0]}; --b: ${video.palette[1]}; --c: ${video.palette[2]}">
          <span class="thumb__tag">${category}</span>
          ${
            video.live
              ? '<span class="thumb__live"><span class="live-dot"></span>Live</span>'
              : `<span class="thumb__time">${escapeHtml(video.duration)}</span>`
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

  function watchDetailHTML(video) {
    const liked = state.liked.has(video.id);
    const disliked = state.disliked.has(video.id);
    const saved = state.saved.has(video.id);
    const subscribed = state.subscribed.has(video.channel);
    const categoryIcon = CATEGORY_ICONS[video.category] || video.glyph || "film";
    const tags = video.tags
      .map((tag) => `#${escapeHtml(tag.replace(/\s+/g, ""))}`)
      .join(" ");
    const likeLabel = formatCount(video.likeCount + (liked ? 1 : 0));
    const comments = state.comments[video.id] || SAMPLE_COMMENTS;
    const progress = Number(video.progress || 0);

    return `
      <div class="watch__topline">
        <button class="back-btn" type="button" data-watch-action="back">
          ${icon("arrowLeft")}<span>Back to feed</span>
        </button>
        <span class="watch-kicker">Preview build</span>
      </div>

      <div class="player" id="watchPlayer">
        <div class="player__art art--${video.pattern}" style="--a: ${video.palette[0]}; --b: ${video.palette[1]}; --c: ${video.palette[2]}">
          <span class="player__shade"></span>
          <span class="player__glyph">${icon(categoryIcon)}</span>
          <span class="player__badge">${icon("camera")}Preview player</span>
          <button class="player__play" type="button" data-watch-action="preview" aria-label="Play preview">
            ${icon("play")}
          </button>
          <span class="player__hint">Connect your own video source in <code>app.js</code></span>
          <div class="player__controls">
            <button class="player__control" type="button" data-toast="Player controls are a placeholder." aria-label="Play">${icon("play")}</button>
            <button class="player__control" type="button" data-toast="Volume is a placeholder." aria-label="Volume">${icon("volume")}</button>
            <span class="player__time">0:00 / ${video.live ? "LIVE" : escapeHtml(video.duration)}</span>
            <span class="player__spacer"></span>
            <button class="player__control" type="button" data-toast="Captions are a placeholder." aria-label="Captions">${icon("captions")}</button>
            <button class="player__control" type="button" data-toast="Player settings are a placeholder." aria-label="Settings">${icon("settings")}</button>
            <button class="player__control" type="button" data-toast="Fullscreen is a placeholder." aria-label="Fullscreen">${icon("fullscreen")}</button>
          </div>
          <div class="player__timeline"><span style="width: ${progress}%"></span></div>
        </div>
      </div>

      <header class="watch-head">
        <h1>${escapeHtml(video.title)}</h1>
        <div class="watch-sub">
          <span>${escapeHtml(video.live ? video.views : video.views)}</span>
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
    const related = window.VIDEO_DATA.filter(
      (item) => item.id !== video.id && !state.hidden.has(item.id),
    )
      .sort((a, b) => Number(b.category === video.category) - Number(a.category === video.category))
      .slice(0, 8);

    el.watchMain.innerHTML = watchDetailHTML(video);
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

  function renderCommentList(video) {
    const list = state.comments[video.id] || SAMPLE_COMMENTS;
    const listNode = $("#commentList");
    const countNode = $("#commentCount");
    if (listNode) listNode.innerHTML = commentsHTML(list);
    if (countNode) countNode.textContent = list.length;
  }

  function showHome() {
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
    const video = window.VIDEO_DATA.find((item) => item.id === id);
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

  function togglePreview() {
    const player = $("#watchPlayer", el.watchMain);
    const button = $('[data-watch-action="preview"]', el.watchMain);
    const timeline = $(".player__timeline span", el.watchMain);
    if (!player || !button) return;
    const playing = !player.classList.contains("is-playing");
    player.classList.toggle("is-playing", playing);
    button.innerHTML = icon(playing ? "pause" : "play");
    button.setAttribute("aria-label", playing ? "Pause preview" : "Play preview");
    if (timeline) {
      timeline.style.transitionDuration = playing ? "18s" : "0.25s";
      timeline.style.width = playing ? "100%" : "0%";
    }
    if (playing) {
      toast("Preview mode — connect a real video source in app.js.");
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

    if (action === "preview") {
      togglePreview();
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
    const video = window.VIDEO_DATA.find((item) => item.id === id);
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
    }
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

    el.createBtn.addEventListener("click", openCreateDialog);
    el.mobileCreateBtn.addEventListener("click", openCreateDialog);
    el.closeCreateBtn.addEventListener("click", () => el.createDialog.close());
    el.cancelCreateBtn.addEventListener("click", () => el.createDialog.close());
    el.createDialog.addEventListener("click", (event) => {
      if (event.target === el.createDialog) el.createDialog.close();
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

  function openCreateDialog() {
    closePopovers();
    closeMenus();
    if (typeof el.createDialog.showModal === "function") {
      el.createDialog.showModal();
    } else {
      el.createDialog.setAttribute("open", "");
    }
  }

  function init() {
    hydrateStaticIcons();
    applyTheme(initialTheme());
    applyDensity();
    renderChips();
    renderFeed();
    updateNotifBadge();

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
