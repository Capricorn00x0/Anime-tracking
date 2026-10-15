# Anime Tracker — Project Log & Handoff Notes

> **Purpose:** single source of truth for any agent picking up this project.
> Covers what was built, what was tried and discarded, current state, and open items.
> **Maintenance rule:** every future change appends a dated entry under
> `## Session Log` (newest on top). Never rewrite history — append only.
>
> **Secrets policy:** admin password is NEVER written here or anywhere in plaintext.
> Only its hash lives in `admin-config.js`.

---

## 1. Project Snapshot

- **What:** Personal anime tracking showcase — "Anime Tracker".
- **Stack:** Plain static site. `index.html` + `styles.css` + `script.js`, Tailwind via CDN,
  vanilla JS. **No build step, no backend, no dependencies to install.**
  Double-click `index.html` works offline (except web APIs/fonts).
- **Data:** browser `localStorage` (key `animeTrackerListV1`) for the admin working copy;
  `anime-data.json` is the published public list.
- **Hosting:** static hosting — GitHub repo pushed to **Vercel** (auto-redeploys on push).
  No server config needed. Deploy = push these files:
  `index.html`, `styles.css`, `script.js`, `admin-config.js`,
  `anime-data.json`, `favicon.png`, `logo-faces/` (cropped), `logo-faces/circle/`.
  (`logo-faces-originals/` is a local backup — keep it OFF GitHub to save space.)
- **Related project (separate folder):** `C:\Users\Admin\portfolio\` — owner's portfolio site.
  It received an ambient orb + canvas-particle background ported from this project's style.
  Portfolio work is logged briefly in §5 (entry 3); its files live outside this folder.

## 2. File Inventory (verified 2026-10-15)

| File | Size | Purpose |
|---|---|---|
| `index.html` | ~13 KB | Layout: header, hero, stats, filters, grid, modals, drawer, login |
| `styles.css` | ~11 KB | Theme, cards, bubbles, collage bg, drawer sheet, dropdown fix |
| `script.js` | ~32 KB | Search (3 APIs), CRUD, views, rotator, favicon sync, admin, drawer |
| `admin-config.js` | tiny | Admin username + password HASH only (`{ user:'fahim', passHash:'cf91cb155dfaf' }`) |
| `anime-data.json` | tiny | Published public list (seed: Naruto, Demon Slayer, Frieren) |
| `favicon.png` | 64×64 | Circular Naruto tab icon (transparent corners), fallback/bookmark icon |
| `logo-faces/` | 14 × 512px JPG squares | Pre-cropped face-centered logo rotation pool |
| `logo-faces/circle/` | 14 × 64px PNGs | Circular transparent-corner versions for the cycling tab icon |
| `logo-faces-originals/` | 14 originals | BACKUP of full posters pre-crop. Local only, do not deploy. |

Faces in rotation (14, 70 s loop): naruto, itachi, eren, gojo2, sasuke, tanjiro,
toji, zenitsu, kakashi, zoro, luffy2, goku, minato, yuji.

## 3. Access & Publishing Workflow

- **Hidden admin entry:** `<site>/#/myadmin` — not linked anywhere on the site.
  Opens login modal. Username `fahim`. Password known only to owner
  (hash `cf91cb155dfaf` = cyrb53 hash of `username::password`; verified by test).
- **Session:** `sessionStorage at_admin=1`, per-tab. Closing the tab logs out.
  "Login" here is deterrent-grade (see §6) — fine for a personal showcase.
- **Public vs admin:** visitors see the list from `anime-data.json`, read-only cards,
  detail sheet WITHOUT edit controls. Admin unlock reveals: `+ Add`, FAB, quick-add
  chips, Edit/Delete/+1ep buttons, ⬇ Sync, 🔒 Logout.
- **Manual Sync (current publishing process — batch edits, sync once at end):**
  1. Log in via `#/myadmin` on your own PC, make edits (saved to localStorage).
  2. Click admin-only ⬇ **Sync** → downloads fresh `anime-data.json`.
  3. Replace that file in the GitHub repo → push → Vercel redeploys (~1 min).
- **Photo changes** (`logo-faces/`, `favicon.png`, `circle/`) deploy by pushing files;
  no Sync step needed for those.

## 4. Feature Inventory (current state)

- Cards ⇄ Bubbles view toggle (persisted `at_view`); filters All/Watching/Finished/Plan;
  local text filter; sort Recent/Rating/A–Z (MAL-score sort exists but flag-gated off);
  stats bar (counts + avg rating).
- **Online search, 3 sources chained** (all free, no key): Jikan (MyAnimeList) →
  AniList (GraphQL) → Kitsu. Auto-fills cover, genres, episodes, year. Rate-limit
  aware (Jikan 60/min, 3/s; 500 ms debounce; 12 s timeouts). Offline → clear error +
  manual cover URL paste / PC upload fallback. 🔎 Google button opens Google Images
  for the title (Google has no keyless image API — manual copy-paste by design).
- **Quick-add chips** open the Add form prefilled with the top result + preview;
  user confirms with Save. Duplicate detection via `animeKey()`
  (`mal:` → `anilist:` → `kitsu:` → `title:`); per-button loading state.
- **Logo rotator:** 14 pre-cropped squares, 5 s fade loop, preloaded, broken files
  auto-skipped, pauses when tab hidden, honors `prefers-reduced-motion`.
- **Tab icon:** `favicon.png` first, then cycles the 14 circular PNGs in sync
  with the logo (different URL per swap forces refresh). Title is "Anime Tracker".
- **Detail view:** full-width sheet sliding from the LEFT with zoom-in/out motion
  (`scale(.96)` anchored left + fade), melt-gradient translucent background,
  poster with bottom-fade mask, hairline detail rows, full-width flowing Notes,
  admin-only Edit button → opens edit form. Close: ✕ / backdrop / Esc. Body scroll-locked.
- **MAL scores hidden** via `const SHOW_SCORES = false` flag (top of `script.js`).
  Gated: card ⭐ badge, drawer MAL row (row hidden), sort option (option removed at
  init — `display:none` on `<option>` is unreliable cross-browser), search/preview
  snippets. Data still fetched + stored; set flag `true` to restore all 7 spots.
- **Dark dropdown fix:** `#sortSel/#fStatus option { background:#0f1530; color:#fff }`
  + `:root { color-scheme: dark }` (native white-on-white popup bug).
- **Background:** drifting gradient orbs (violet/cyan/pink) + 70-dot rising-particle
  canvas + collage layer (top-anime posters via Jikan, Kitsu fallback). 🌌 toggle.

## 5. Session Log (newest on top)

### 2026-10-15 — Handoff log created (`PROJECT-LOG.md`)
Wrote this file. Verified inventory (§2) against disk.

### 2026-10-15 — MAL scores hidden behind `SHOW_SCORES=false` flag
Owner first asked to remove, then chose hide-over-delete for reversibility.
Implemented as one constant gating 7 spots (badge, drawer row+hidden attr, sort
option removed at init, sort branch, search snippet, preview meta). Data layer untouched.

### 2026-10-15 — Detail motion → zoom in/out anchored left
Replaced `translateX(-60px)` slide with `scale(.96)` + fade (origin left center),
timing .30 s/.25 s. Same classes/IDs — zero JS changes.

### 2026-10-15 — Zoom-pop sheet built, then REVERTED as "dull"
Centered `scale(.94)` sheet (900px, 220 ms) built to fix perceived slowness; owner
called it dull. Reverted byte-for-byte to the melt drawer (owner explicitly chose
exact restore over a faster variant). Lesson: look wins over speed here.

### 2026-10-15 — Detail view evolution (sequence matters)
Centered modal → right slide-in drawer → seamless-blend restyle (melt gradient,
no borders/shadow, hairline rows) → blur reduced (backdrop 10→6px, sheet 18→12px)
→ mirrored to LEFT (✕ moved to outer/right edge) → Notes to full-width stacked
paragraph → full-width 2-col sheet (poster sticky left, details right, 960px cap)
→ slow/stuck complaint (full-screen blurs + collage + particles repainting) →
zoom-pop detour → revert → zoom-motion on left sheet (current).

### 2026-10-15 — Sort dropdown white-on-white fix
Native option popup inherited white text on white. Fixed with dark option CSS +
`color-scheme: dark`. Also covers the Status select in the Add form.

### 2026-10-15 — Tab title + live cycling favicon
Title `Anime Tracker — Watching & Finished` → `Anime Tracker`. Generated
`favicon.png` (64px circular Naruto, transparent corners) + `logo-faces/circle/`
(14 verified circular PNGs, corners A=0, centers opaque). Rotator updates the tab
icon each swap. Apple touch icon added. Note: browsers cache the first icon —
hard-refresh/close-tab once if the globe persists.

### 2026-10-15 — All logo faces pre-cropped to 512px squares
Owner's key demand: faces perfectly centered, no empty spaces, no runtime math.
Backed up originals → `logo-faces-originals/`. Cropped each to a face-centered
square (face ~44% from top; Zenitsu/Minato full-body shots got tight head-cuts)
via System.Drawing (high-quality bicubic, JPEG q85). EVERY result visually
inspected — all passed. Rotator simplified to filename-only entries.

### 2026-10-15 — 6 photos added, 2 deleted; renamed + reframed
Owner deleted `gojo.jpg` + `luffy.jpg` (the two bad framings) and added Zoro, new
Luffy, new blindfold Gojo, Goku, Minato (full-body — flagged as softer, like
Zenitsu), Yuji. Renamed all to simple lowercase names; folder `Logo faces` →
`logo-faces` (URL-safe for Vercel). 14-face loop. New art measured per-photo.

### 2026-10-15 — Gojo/Luffy centering saga
Per-face pos/zoom tuning → owner: both read LOW → recomputed values → still off →
owner deleted both photos and supplied better art. Lesson: bad source art beats
tuning; replacing the photo wins.

### 2026-10-15 — Logo face rotator built
Replaced `映` glyph with 34px gradient-ring circle cycling 10 (later 14) local
photos every 5 s with fade. Preload, broken-file skip, hidden-tab pause,
reduced-motion respect. Folder renamed for URL safety (spaces/emoji/Arabic names
removed — those break some hosts/Git pushes).

### 2026-10-15 — Hero/footer/tagline removals
Removed in order: hero help sentence → replaced with "My personal anime
collection." → trimmed to same → footer credits line removed → footer removed
entirely → header `watching • finished` tagline removed.

### 2026-10-15 — Hidden admin area (`#/myadmin`) + public read-only mode
Owner's requirement: hosted site must not let visitors edit. Implemented:
unlinked `#/myadmin` hash route opens login; username + cyrb53-hashed password
in `admin-config.js` (hash `cf91cb155dfaf`, login verified by test);
`sessionStorage` session; `[data-admin]` gating (+ `[hidden]{display:none!important}`
safety rule); public list loads from `anime-data.json` with localStorage fallback;
admin works on localStorage + ⬇ Sync export workflow; visitors get read-only
detail view; all edit paths (`openAdd`/`openEdit`/`saveModal`/delete/quick-add)
guard with `if (!isAdmin) return`. Test script verified hash + all 22 IDs + wiring.

### 2026-10-15 — Manual vs auto sync decision → MANUAL (twice confirmed)
Explained: adds save to localStorage only; publishing needs Sync→replace→push→redeploy.
Owner confirmed manual twice. Firebase auto-sync fully planned (Firestore + Auth,
rules, migration, free-tier limits) and DEFERRED — see §7.

### 2026-10-15 — Search upgraded: AniList 3rd source + Google helper
Google Images has NO keyless API + blocks browser scraping → cannot auto-fetch
"from Google". Instead: chain is now Jikan → AniList (GraphQL, no key, great
covers) → Kitsu, plus 🔎 Google button opening an Images search for manual
copy-paste into the Cover field. `anilist_id` added to `animeKey()` + saves.

### 2026-10-15 — Quick-add fixed (2 real bugs)
(a) Kitsu results all carry `mal_id:0` → 2nd quick-add always false-reported
"Already in your list". Fixed with cross-source `animeKey()`. (b) Silent direct-add
looked broken under filters → now opens the Add form prefilled with preview;
user confirms with Save. Plus: loading state, offline → form still opens for
manual entry, prefill ordering bug fixed.

### 2026-10-15 — Portfolio background (sibling folder, for reference)
Owner asked what the floating bubbles are (ambient particle/bokeh background),
chose CSS-orbs-only, then asked to match the tracker exactly. Ported: violet/cyan/
pink gradient wash + 70-dot canvas particles + glassy translucent header to
`C:\Users\Admin\portfolio\` (`index.html`, `styles.css`, `script.js`). No anime
collage there (kept professional).

### 2026-10-15 — Art/search failure fix + import/export removed
Symptoms: blank cards + "no internet" on search. Root causes: external
`placehold.co` fallback (also needs internet) + MAL CDN hotlink friction + single
API (Jikan) with no fallback. Fixes: offline inline-SVG placeholder, healing of
old placeholder URLs on load, `referrerpolicy="no-referrer"`, Kitsu fallback
(later AniList too), manual cover-URL paste + PC upload field. Import/export
buttons removed per owner (later replaced by admin-only ⬇ Sync with a different
purpose — file deployment, not backup).

### 2026-10-15 — Project created (`anime-tracker/`)
Same 3-file shape as `portfolio/`: Tailwind CDN, cards⇄bubbles toggle,
localStorage, Jikan auto-art search, live collage + particle background,
quick-add chips, stats, filters/sort, seeded with Naruto/Demon Slayer/Frieren.

## 6. Standing Decisions & Tradeoffs (do not re-litigate without asking owner)

- **Static hosting ⇒ JS-only login is deterrent-grade.** A skilled user can bypass
  via view-source. Accepted for a personal showcase. Real security = Firebase
  Auth + Firestore rules (§7).
- **Manual Sync accepted (twice).** Do not auto-migrate to cloud without approval.
- **Zenitsu + Minato crops are tight head-cuts** from full-body posters — slightly
  softer than close-up portraits. If owner complains, ask for close-up replacements
  (same filenames, zero code changes).
- **`anime-data.json` seeds ≠ owner's live list.** Owner's real cards live in their
  browser localStorage; the JSON holds the 3 seeds until their first Sync.
- **Favicon caching:** browsers pin the first icon; advise hard-refresh on change.
- **Crowded filenames are banned** from `logo-faces/` (spaces/emoji/non-ASCII break
  hosts). Keep the lowercase convention.

## 7. Open Items

- **Firebase auto-sync (PLANNED, DEFERRED):** Firestore + Auth free tier; live reads,
  admin-only writes via rules; `#/myadmin` maps to Firebase login; ⬇ Sync removed;
  one-time migration via temp upload button. Needs from owner: `apiKey`,
  `authDomain`, `projectId` + admin email (password set privately in console).
  Full plan already presented in chat — execute on owner's "build auto-sync".
- Nothing else open. Last verified state: all checks green (JS syntax, hash login,
  IDs/wiring, 14 faces, 14 circle icons, 512px squares, valid JSON).
