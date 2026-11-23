# Vista — clean video library

A self-contained, YouTube-shaped viewer: home feed, watch page, sidebar, dark mode, search, filters, and a placeholder player. Every thumbnail is generated with CSS, so there are no external assets or network calls.

## Run it

Open `index.html` directly, or serve the folder:

```sh
python -m http.server 4173
```

Then visit <http://127.0.0.1:4173>.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | Static shell: header, sidebar, home view, watch view, dialogs |
| `styles.css` | All layout, palette, typography, and the generated thumbnail art |
| `icons.js` | Inline SVG icon set (`window.VistaIcons`) |
| `data.js` | Placeholder library (`window.VIDEO_DATA`) and category list |
| `app.js` | Routing, rendering, and interactions |

## Swap in your own content

Everything the feed renders comes from `data.js`. Each entry:

```js
{
  id: "quiet-grid",            // used in #watch/<id> and for saved/liked state
  title: "…",
  channel: "Field Notes",
  initials: "FN",              // avatar text
  channelColor: "#2f5d50",     // avatar background
  verified: true,
  subscribers: "184K",
  views: "128K views",
  age: "2 days ago",
  duration: "12:04",           // empty string for live items
  category: "Design",          // must match an entry in VISTA_CATEGORIES
  tags: ["design", "interface"],
  pattern: "rings",            // rings | grid | wave | arch | beam | dots | stripes | orb | frame
  palette: ["#dbe7df", "#8eb4a4", "#24463e"],
  glyph: "grid",               // icon name from icons.js
  likeCount: 8421,
  progress: 42,                // optional, 0–100
  live: false,                 // optional
  description: "…",
}
```

To use real thumbnails, replace the `.thumb` div in `cardHTML` (`app.js`) with an `<img>`:

```html
<img src="${video.thumbnail}" alt="" loading="lazy" />
```

## Hooking up a player

The player is a styled placeholder. To play media you own, drop a `<video>` element into `watchDetailHTML` in `app.js`. If YouTube is permitted on your network, the supported route is YouTube's official IFrame Player API (`https://www.youtube.com/iframe_api`) with videos you have the right to embed — it loads from YouTube's own domains, so it only works where YouTube is reachable.

## What works

- `#watch/<id>` deep links and back navigation
- Live search, category chips, channel filtering, sidebar sections
- Save / like / subscribe state persisted in `localStorage`
- Card menus, notifications panel, profile menu, upload dialog
- Light and dark themes, compact grid, keyboard shortcut `/` to search
- Responsive layout down to 390px with a mobile tab bar

All state is local to the browser; there is no backend.
