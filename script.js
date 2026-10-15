// Anime Tracker — Jikan v4 (free, no key) + localStorage
const KEY = 'animeTrackerListV1';
// Feature flag: MAL scores are hidden from the site but data is kept.
// Set to true any time to bring them back (badge, drawer row, sort, search hints).
const SHOW_SCORES = false;
const $ = (id) => document.getElementById(id);

let list = [];
let view = 'cards';
let isAdmin = false;
try {
  view = localStorage.getItem('at_view') || 'cards';
  isAdmin = sessionStorage.getItem('at_admin') === '1';
} catch (e) {}
let filter = 'all';
let sortBy = 'recent';
let localQuery = '';
let editingId = null;
let picked = null; // anime picked from Jikan
let searchTimer = null;
let lastApiCall = 0;

const PLACEHOLDER = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="560"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#312e81"/><stop offset="1" stop-color="#0e7490"/></linearGradient></defs><rect width="400" height="560" fill="url(#g)"/><text x="200" y="270" font-size="72" text-anchor="middle" fill="#fff">🍥</text><text x="200" y="330" font-size="28" text-anchor="middle" fill="#c4b5fd" font-family="sans-serif">No Art Yet</text></svg>');

function imgFallback(el) { el.onerror = null; el.src = PLACEHOLDER; }

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.add('hidden'), 2600);
}

// ---------- DATA ----------
// Public visitors read the shared anime-data.json (your published list).
// Admin works on the browser copy (localStorage), then Syncs it to the file.
function isVisible(a) { return !a || a.visible !== false; }

function seed() {
  list = [
    { id: 1, mal_id: 20, title: 'Naruto', visible: true, image: 'https://cdn.myanimelist.net/images/anime/13/17405.jpg', status: 'finished', rating: 9, epWatched: 220, epTotal: 220, genres: ['Action','Adventure'], malScore: 8.0, notes: 'The classic that started it all 🍜', dateAdded: Date.now() - 86400000 * 9 },
    { id: 2, mal_id: 38000, title: 'Demon Slayer', visible: true, image: 'https://cdn.myanimelist.net/images/anime/1286/99889.jpg', status: 'watching', rating: 9, epWatched: 32, epTotal: 55, genres: ['Action','Fantasy'], malScore: 8.6, notes: 'Animation is unreal 🔥', dateAdded: Date.now() - 86400000 * 4 },
    { id: 3, mal_id: 52991, title: 'Frieren: Beyond Journey\'s End', visible: true, image: 'https://cdn.myanimelist.net/images/anime/2226/122931.jpg', status: 'plan', rating: 10, epWatched: 0, epTotal: 28, genres: ['Adventure','Fantasy'], malScore: 8.9, notes: 'Everyone says cry at ep 1 😭', dateAdded: Date.now() - 86400000 },
  ];
  save();
}
function heal() {
  // swap old external placeholder URLs (need internet) to the offline one
  let fixed = false;
  list.forEach(a => { if (a.image && a.image.indexOf('placehold.co') !== -1) { a.image = PLACEHOLDER; fixed = true; } });
  // migrate old entries without a flag: missing = live (stays visible)
  list.forEach(a => { if (a.visible === undefined) { a.visible = true; fixed = true; } });
  if (fixed) save();
}
async function loadData() {
  let fileList = null;
  try {
    const r = await fetch('anime-data.json', { cache: 'no-store' });
    if (r.ok) { const j = await r.json(); if (Array.isArray(j)) fileList = j; }
  } catch (e) { fileList = null; } // file:// or missing file -> fall back below
  let local = null;
  try { const raw = localStorage.getItem(KEY); if (raw) local = JSON.parse(raw); } catch (e) { local = null; }
  if (isAdmin) {
    if (Array.isArray(local)) list = local;
    else if (Array.isArray(fileList)) { list = fileList; save(); }
    else seed();
  } else {
    if (Array.isArray(fileList)) list = fileList;
    else if (Array.isArray(local)) list = local;
    else seed();
  }
  heal();
  // Visitors never see drafts, even if an old file still contains them.
  if (!isAdmin) list = list.filter(isVisible);
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} }

// ---------- ANIME SEARCH: Jikan → AniList → Kitsu (all free, no key) ----------
async function fetchJson(url, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms || 12000);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'Accept': 'application/json' } });
    return res;
  } finally { clearTimeout(t); }
}
async function anilistSearch(q) {
  const query = 'query ($s: String) { Page(perPage: 8) { media(search: $s, type: ANIME) { id title { romaji english } coverImage { extraLarge large } genres averageScore episodes startDate { year } } } }';
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query: query, variables: { s: q } })
    });
    if (res.status === 429) throw new Error('Rate limited');
    if (!res.ok) throw new Error('AniList ' + res.status);
    const json = await res.json();
    const media = (json.data && json.data.Page && json.data.Page.media) || [];
    return media.map(m => ({
      mal_id: 0, anilist_id: m.id,
      title: (m.title && (m.title.english || m.title.romaji)) || 'Unknown',
      image: (m.coverImage && (m.coverImage.extraLarge || m.coverImage.large)) || PLACEHOLDER,
      genres: (m.genres || []).slice(0, 4),
      malScore: m.averageScore ? Math.round(m.averageScore) / 10 : 0,
      episodes: m.episodes || 12,
      year: (m.startDate && m.startDate.year) || '',
      synopsis: '', source: 'anilist'
    }));
  } finally { clearTimeout(t); }
}
async function kitsuSearch(q) {
  const res = await fetchJson('https://kitsu.io/api/edge/anime?filter[text]=' + encodeURIComponent(q) + '&page[limit]=8');
  if (!res.ok) throw new Error('Kitsu error ' + res.status);
  const json = await res.json();
  return (json.data || []).map(a => {
    const at = (a.attributes) || {};
    const img = (at.posterImage) || {};
    return {
      mal_id: 0, kitsu_id: a.id,
      title: (at.titles && (at.titles.en || at.titles.en_jp)) || at.canonicalTitle || 'Unknown',
      image: img.large || img.medium || img.small || PLACEHOLDER,
      genres: [], malScore: at.averageRating ? (Math.round(at.averageRating) / 10) : 0,
      episodes: at.episodeCount || 12,
      year: (at.startDate || '').slice(0, 4), synopsis: at.synopsis || '', source: 'kitsu'
    };
  });
}
async function jikanSearch(q) {
  // respect 3 req/sec
  const now = Date.now();
  const wait = Math.max(0, 400 - (now - lastApiCall));
  if (wait) await new Promise(r => setTimeout(r, wait));
  lastApiCall = Date.now();
  try {
    const res = await fetchJson('https://api.jikan.moe/v4/anime?q=' + encodeURIComponent(q) + '&limit=8&order_by=members&sort=desc');
    if (res.status === 429) throw new Error('Rate limited — wait 10 sec then retry');
    if (!res.ok) throw new Error('Jikan ' + res.status);
    const json = await res.json();
    const out = (json.data || []).map(a => ({
      mal_id: a.mal_id,
      title: a.title_english || a.title,
      image: (a.images && a.images.jpg && (a.images.jpg.large_image_url || a.images.jpg.image_url)) || PLACEHOLDER,
      genres: (a.genres || []).map(g => g.name).slice(0, 4),
      malScore: a.score || 0,
      episodes: a.episodes || 12,
      year: (a.aired && a.aired.prop && a.aired.prop.from && a.aired.prop.from.year) || '',
      synopsis: a.synopsis || '', source: 'jikan'
    }));
    if (out.length) return out;
    const al = await anilistSearch(q); // jikan empty -> try anilist
    if (al.length) return al;
    return await kitsuSearch(q); // then kitsu
  } catch (err) {
    if (String(err && err.name) === 'AbortError') throw new Error('Request timed out — slow network, retry');
    // network fail / blocked -> automatic fallbacks: AniList, then Kitsu
    try { const al = await anilistSearch(q); if (al.length) return al; }
    catch (e2) { /* try next */ }
    try { const k = await kitsuSearch(q); if (k.length) return k; }
    catch (e3) { /* fall through to original error */ }
    if (String(err.message || err).includes('Failed to fetch') || err instanceof TypeError)
      throw new Error('No internet / API blocked. Check connection, disable VPN/ad-block, or paste cover link manually below');
    throw err;
  }
}

function onSearchInput(e) {
  const q = e.target.value.trim();
  const box = $('searchResults'), st = $('searchStatus');
  clearTimeout(searchTimer);
  if (q.length < 2) { box.innerHTML = ''; st.textContent = ''; return; }
  st.textContent = 'typing…';
  searchTimer = setTimeout(async () => {
    st.textContent = 'searching online… ✨ (MyAnimeList → AniList → Kitsu)';
    try {
      const items = await jikanSearch(q);
      st.textContent = items.length ? items.length + ' found — click one 👇' : 'No results. Try another spelling, or add manually below.';
      box.innerHTML = items.map((a, i) => (
        '<div class="rrow" data-i="' + i + '">' +
        '<img loading="lazy" referrerpolicy="no-referrer" src="' + esc(a.image) + '" onerror="imgFallback(this)" />' +
        '<div class="min-w-0"><p class="font-semibold text-sm truncate">' + esc(a.title) + '</p>' +
        '<p class="text-xs text-slate-400">' + (a.year || '') + (SHOW_SCORES && a.malScore ? ' • ⭐ ' + a.malScore : '') + ' • ' + a.episodes + ' ep</p></div></div>'
      )).join('');
      box.querySelectorAll('.rrow').forEach(el => {
        el.addEventListener('click', () => {
          picked = items[+el.dataset.i];
          fillPicked();
          box.innerHTML = '';
          st.textContent = '✔ picked: ' + picked.title;
        });
      });
      box._items = items;
    } catch (err) {
      st.textContent = '⚠ ' + err.message;
    }
  }, 500);
}

function fillPicked() {
  if (!picked) return;
  $('preview').classList.remove('hidden');
  $('pvImg').src = picked.image;
  $('pvImg').onerror = function () { imgFallback(this); };
  $('pvTitle').textContent = picked.title;
  $('pvMeta').textContent = (picked.year ? picked.year + ' • ' : '') + (SHOW_SCORES && picked.malScore ? 'MAL ⭐ ' + picked.malScore + ' • ' : '') + picked.episodes + ' eps';
  $('pvGenres').innerHTML = picked.genres.map(g => '<span class="gchip">' + esc(g) + '</span>').join('');
  $('fGenres').value = picked.genres.join(', ');
  $('fEpTotal').value = picked.episodes || 12;
  $('fCover').value = (picked.image && picked.image.indexOf('data:') !== 0) ? picked.image : '';
  if (editingId == null) $('animeSearch').value = picked.title;
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// Unique identity for an anime across Jikan + Kitsu sources.
// (Kitsu results all carry mal_id 0, so mal_id alone falsely matches.)
function animeKey(a) {
  if (a.mal_id) return 'mal:' + a.mal_id;
  if (a.anilist_id) return 'anilist:' + a.anilist_id;
  if (a.kitsu_id) return 'kitsu:' + a.kitsu_id;
  return 'title:' + String(a.title || '').trim().toLowerCase();
}
function isDuplicate(a) {
  const k = animeKey(a);
  return list.some(x => animeKey(x) === k);
}

// ---------- HIDDEN ADMIN ----------
// Entry: your-site/#/myadmin (not linked anywhere). Session lasts per tab.
function cyrb53(str, seed) {
  let h1 = 0xdeadbeef ^ (seed || 0), h2 = 0x41c6ce57 ^ (seed || 0);
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
function applyAdminUI() {
  document.querySelectorAll('[data-admin]').forEach(el => { el.hidden = !isAdmin; });
}
function openLogin() {
  $('loginErr').classList.add('hidden');
  $('loginUser').value = ''; $('loginPass').value = '';
  $('loginModal').classList.remove('hidden');
  setTimeout(() => $('loginUser').focus(), 50);
}
function closeLogin() { $('loginModal').classList.add('hidden'); }
function tryLogin() {
  const u = $('loginUser').value.trim();
  const p = $('loginPass').value;
  const cfg = (typeof ADMIN !== 'undefined') ? ADMIN : null;
  if (cfg && u === cfg.user && cyrb53(u + '::' + p) === cfg.passHash) {
    isAdmin = true;
    try { sessionStorage.setItem('at_admin', '1'); } catch (e) {}
    closeLogin(); applyAdminUI(); render();
    toast('Welcome back, admin 👑');
  } else {
    $('loginErr').classList.remove('hidden');
  }
}
function logout() {
  isAdmin = false;
  try { sessionStorage.removeItem('at_admin'); } catch (e) {}
  applyAdminUI(); render();
  toast('Logged out 🔒');
}
function checkAdminRoute() {
  if (location.hash === '#/myadmin' || location.hash === '#myadmin') {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { location.hash = ''; }
    if (isAdmin) toast('Already logged in as admin 👑');
    else openLogin();
  }
}
// Slide-in detail drawer for visitors (+ admin Edit entry)
let drawerId = null;
function openDetail(id) {
  const a = list.find(x => x.id === id);
  if (!a) return;
  if (!isAdmin && !isVisible(a)) return;
  drawerId = id;
  $('dTitle').textContent = a.title;
  $('dImg').src = a.image || PLACEHOLDER;
  $('dImg').onerror = function () { imgFallback(this); };
  $('dBadge').innerHTML = badge(a.status);
  $('dStars').textContent = stars(a.rating);
  $('dRating').textContent = a.rating + '/10';
  $('dScoreRow').hidden = !SHOW_SCORES;
  if (SHOW_SCORES) $('dScore').textContent = a.malScore ? '⭐ ' + a.malScore : '—';
  $('dGenres').innerHTML = (a.genres || []).map(g => '<span class="gchip">' + esc(g) + '</span>').join('') || '<span class="text-slate-500 text-xs">—</span>';
  const pct = a.epTotal ? Math.min(100, Math.round((a.epWatched / a.epTotal) * 100)) : 0;
  $('dBar').style.width = pct + '%';
  $('dEp').textContent = a.epWatched + ' / ' + a.epTotal + ' eps';
  $('dNotes').textContent = a.notes ? '“' + a.notes + '”' : '—';
  $('drawerBackdrop').classList.add('show');
  const dr = $('detailDrawer');
  // double rAF so the slide animation plays from the hidden state
  requestAnimationFrame(() => requestAnimationFrame(() => dr.classList.add('show')));
  document.body.classList.add('locked');
}
function closeDetail() {
  $('detailDrawer').classList.remove('show');
  $('drawerBackdrop').classList.remove('show');
  document.body.classList.remove('locked');
  drawerId = null;
}

// ---------- RENDER ----------
function badge(s) {
  if (s === 'watching') return '<span class="badge b-watching">🟢 Watching</span>';
  if (s === 'finished') return '<span class="badge b-finished">🔵 Finished</span>';
  return '<span class="badge b-plan">🟡 Plan to Watch</span>';
}
function stars(r) { r = Math.round(r / 2); return '★'.repeat(r) + '☆'.repeat(5 - r); }

function filtered() {
  let out = list.slice();
  if (!isAdmin) out = out.filter(isVisible);
  if (filter !== 'all') out = out.filter(a => a.status === filter);
  if (localQuery) out = out.filter(a => (a.title + ' ' + (a.genres || []).join(' ')).toLowerCase().includes(localQuery));
  if (sortBy === 'rating') out.sort((a, b) => b.rating - a.rating);
  else if (sortBy === 'title') out.sort((a, b) => a.title.localeCompare(b.title));
  else if (sortBy === 'score' && SHOW_SCORES) out.sort((a, b) => (b.malScore || 0) - (a.malScore || 0));
  else out.sort((a, b) => b.dateAdded - a.dateAdded);
  return out;
}

function render() {
  const items = filtered();
  const grid = $('animeGrid');
  $('emptyState').classList.toggle('hidden', items.length > 0);
  grid.className = view === 'cards' ? 'cards-grid' : 'bubbles-grid';

  if (view === 'cards') {
    grid.innerHTML = items.map(a => {
      const pct = a.epTotal ? Math.min(100, Math.round((a.epWatched / a.epTotal) * 100)) : 0;
      return '<article class="acard" data-id="' + a.id + '">' +
        '<div class="relative"><img class="cover" loading="lazy" referrerpolicy="no-referrer" src="' + esc(a.image) + '" onerror="imgFallback(this)" alt="' + esc(a.title) + '" />' +
        '<div class="absolute top-2 left-2">' + badge(a.status) + (isAdmin && !isVisible(a) ? ' <span class="badge b-draft">🚫 Draft</span>' : '') + '</div>' +
        (isAdmin ? '<button class="vis-toggle ' + (isVisible(a) ? 'on' : 'off') + '" data-act="vis" title="' + (isVisible(a) ? 'Live — click to hide' : 'Hidden draft — click to publish') + '"><span class="knob"></span><span class="lbl">' + (isVisible(a) ? 'ON' : 'OFF') + '</span></button>' : '') +
        (SHOW_SCORES && a.malScore ? '<div class="absolute ' + (isAdmin ? 'top-12' : 'top-2') + ' right-2 text-[11px] bg-black/70 rounded-full px-2 py-1">⭐ ' + a.malScore + '</div>' : '') + '</div>' +
        '<div class="pad"><h3 class="font-display font-bold leading-snug">' + esc(a.title) + '</h3>' +
        '<p class="text-xs text-slate-400 mt-1">My rating <span class="text-amber-300">' + stars(a.rating) + '</span> <b class="text-slate-200">' + a.rating + '/10</b> • ' + a.epWatched + '/' + a.epTotal + ' ep</p>' +
        '<div class="progress mt-2"><div style="width:' + pct + '%"></div></div>' +
        '<div class="flex gap-1 flex-wrap mt-2">' + (a.genres || []).slice(0, 3).map(g => '<span class="gchip">' + esc(g) + '</span>').join('') + '</div>' +
        (a.notes ? '<p class="text-xs text-slate-400 mt-2 line-clamp-2">“' + esc(a.notes) + '”</p>' : '') +
        (isAdmin ? '<div class="card-actions"><button class="mini-btn" data-act="plus">+1 ep</button><button class="mini-btn" data-act="edit">Edit</button><button class="mini-btn" data-act="del">🗑</button></div>' : '') +
        '</div></article>';
    }).join('');
  } else {
    grid.innerHTML = items.map(a =>
      '<div class="abubble" data-id="' + a.id + '"><div class="orb"><img loading="lazy" referrerpolicy="no-referrer" src="' + esc(a.image) + '" onerror="imgFallback(this)" alt="' + esc(a.title) + '" /></div>' +
      '<p>' + esc(a.title) + (isAdmin && !isVisible(a) ? ' 🚫' : '') + '</p><div class="sub">' + badge(a.status) + ' • ' + a.rating + '/10</div>' +
      (isAdmin ? '<button class="mini-btn vis-bubble ' + (isVisible(a) ? 'on' : 'off') + '" data-act="vis">' + (isVisible(a) ? 'ON' : 'OFF') + '</button>' : '') + '</div>'
    ).join('');
  }

  // stats
  $('stWatching').textContent = list.filter(a => a.status === 'watching').length;
  $('stFinished').textContent = list.filter(a => a.status === 'finished').length;
  $('stPlan').textContent = list.filter(a => a.status === 'plan').length;
  $('stAvg').textContent = list.length ? (list.reduce((s, a) => s + (+a.rating || 0), 0) / list.length).toFixed(1) : '–';

  // wire clicks
  grid.querySelectorAll('[data-id]').forEach(el => {
    el.addEventListener('click', (ev) => {
      const id = +el.dataset.id;
      if (!isAdmin) { openDetail(id); return; } // visitors: read-only popup
      const btn = ev.target.closest('[data-act]');
      if (!btn && view === 'cards' && !ev.target.closest('.card-actions')) return openEdit(id);
      if (!btn && view === 'bubbles') return openEdit(id);
      const act = btn && btn.dataset.act;
      if (act === 'plus') { const a = list.find(x => x.id === id); if (a) { a.epWatched = Math.min(a.epTotal || 999, (+a.epWatched || 0) + 1); if (a.epWatched >= a.epTotal && a.epTotal) a.status = 'finished'; save(); render(); } }
      if (act === 'edit') openEdit(id);
      if (act === 'vis') { const a = list.find(x => x.id === id); if (a) { a.visible = !isVisible(a); save(); render(); toast(a.visible ? 'Live on next Sync 🌐' : 'Hidden draft 🚫'); } }
      if (act === 'del') { if (confirm('Remove this anime?')) { list = list.filter(x => x.id !== id); save(); render(); toast('Removed 🗑'); } }
      ev.stopPropagation();
    });
  });

  // view buttons
  $('viewCards').classList.toggle('active', view === 'cards');
  $('viewBubbles').classList.toggle('active', view === 'bubbles');
}

// ---------- MODAL ----------
function openAdd(prefill) {
  if (!isAdmin) return; // admin only
  editingId = null; picked = null;
  $('modalTitle').textContent = 'Add anime';
  $('deleteBtn').classList.add('hidden');
  $('preview').classList.add('hidden');
  $('animeSearch').value = prefill || '';
  $('searchResults').innerHTML = '';
  $('searchStatus').textContent = '';
  $('fStatus').value = 'watching';
  $('fRating').value = 8; $('ratingOut').textContent = '8'; paintStars();
  $('fEpWatched').value = 1; $('fEpTotal').value = 12;
  $('fGenres').value = ''; $('fNotes').value = ''; $('fCover').value = '';
  $('fVisible').checked = false; // new tiles start as private drafts
  $('modal').classList.remove('hidden');
  setTimeout(() => $('animeSearch').focus(), 50);
  if (prefill) { $('animeSearch').value = prefill; doQuickPrefill(prefill); }
}
async function doQuickPrefill(q) {
  try {
    $('searchStatus').textContent = 'searching anime… ✨';
    const items = await jikanSearch(q);
    if (items[0]) { picked = items[0]; fillPicked(); $('searchStatus').textContent = '✔ picked: ' + picked.title; }
  } catch (e) { $('searchStatus').textContent = '⚠ ' + e.message; }
}
function openEdit(id) {
  if (!isAdmin) { openDetail(id); return; }
  const a = list.find(x => x.id === id);
  if (!a) return;
  editingId = id;
  picked = { mal_id: a.mal_id, title: a.title, image: a.image, genres: a.genres || [], malScore: a.malScore || 0, episodes: a.epTotal || 12 };
  $('modalTitle').textContent = 'Edit — ' + a.title;
  $('deleteBtn').classList.remove('hidden');
  $('animeSearch').value = a.title;
  $('searchResults').innerHTML = ''; $('searchStatus').textContent = 'editing your saved entry ✏️';
  fillPicked();
  $('fStatus').value = a.status;
  $('fRating').value = a.rating; $('ratingOut').textContent = a.rating; paintStars();
  $('fEpWatched').value = a.epWatched; $('fEpTotal').value = a.epTotal;
  $('fGenres').value = (a.genres || []).join(', ');
  $('fNotes').value = a.notes || '';
  $('fCover').value = (a.image && a.image.indexOf('data:') !== 0) ? a.image : '';
  $('fVisible').checked = isVisible(a);
  $('modal').classList.remove('hidden');
}
function closeModal() { $('modal').classList.add('hidden'); editingId = null; picked = null; }

function paintStars() { $('stars').textContent = stars(+$('fRating').value) + '  ' + $('fRating').value + '/10'; }

function saveModal() {
  if (!isAdmin) return; // admin only
  const title = (picked && picked.title) || $('animeSearch').value.trim();
  if (!title) { toast('Type a name first ✍️'); return; }
  const manualCover = $('fCover').value.trim();
  const data = {
    title,
    image: manualCover || (picked && picked.image) || PLACEHOLDER,
    mal_id: (picked && picked.mal_id) || 0,
    anilist_id: (picked && picked.anilist_id) || 0,
    kitsu_id: (picked && picked.kitsu_id) || 0,
    malScore: (picked && picked.malScore) || 0,
    status: $('fStatus').value,
    rating: +$('fRating').value || 0,
    epWatched: Math.max(0, +$('fEpWatched').value || 0),
    epTotal: Math.max(0, +$('fEpTotal').value || 0),
    genres: $('fGenres').value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 4),
    notes: $('fNotes').value.trim(),
    visible: $('fVisible').checked,
  };
  if (editingId != null) {
    const a = list.find(x => x.id === editingId);
    Object.assign(a, data);
    toast('Updated ✨');
  } else {
    list.unshift(Object.assign({ id: Date.now(), dateAdded: Date.now() }, data));
    toast('Added “' + title + '” 🎉');
  }
  save(); render(); closeModal();
}

// ---------- BACKGROUND COLLAGE + PARTICLES ----------
async function buildCollage() {
  const box = $('bg-collage');
  try {
    const res = await fetchJson('https://api.jikan.moe/v4/top/anime?limit=14');
    const json = await res.json();
    const imgs = (json.data || []).map(a => a.images.jpg.large_image_url).filter(Boolean);
    if (!imgs.length) throw new Error('empty');
    const doubled = imgs.concat(imgs);
    box.innerHTML = doubled.map(u => '<img loading="lazy" referrerpolicy="no-referrer" src="' + u + '" onerror="this.remove()" alt="" />').join('');
  } catch (e) {
    try { // fallback: Kitsu trending posters
      const res = await fetchJson('https://kitsu.io/api/edge/trending/anime?limit=10');
      const json = await res.json();
      const imgs = (json.data || []).map(a => a.attributes && a.attributes.posterImage && a.attributes.posterImage.small).filter(Boolean);
      const doubled = imgs.concat(imgs);
      box.innerHTML = doubled.map(u => '<img loading="lazy" referrerpolicy="no-referrer" src="' + u + '" onerror="this.remove()" alt="" />').join('');
    } catch (e2) { box.innerHTML = ''; }
  }
}
function particles() {
  const c = $('bg-particles'), ctx = c.getContext('2d');
  let W, H, dots = [];
  function size() { W = c.width = innerWidth; H = c.height = innerHeight; }
  size(); addEventListener('resize', size);
  for (let i = 0; i < 70; i++) dots.push({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, r: Math.random() * 2 + .5, s: Math.random() * .5 + .15, o: Math.random() * .5 + .15 });
  (function tick() {
    ctx.clearRect(0, 0, W, H);
    dots.forEach(d => {
      d.y -= d.s; if (d.y < -5) { d.y = H + 5; d.x = Math.random() * W; }
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 7);
      ctx.fillStyle = 'rgba(196,181,253,' + d.o + ')'; ctx.fill();
    });
    if (!document.body.classList.contains('bg-off')) requestAnimationFrame(tick);
    else setTimeout(() => requestAnimationFrame(tick), 500);
  })();
}

// ---------- LOGO FACE ROTATOR (5s loop) ----------
// Files are pre-cropped face-centered squares, so no per-face math needed.
const LOGO_FACES = [
  { file: 'naruto.jpg',  name: 'Naruto' },
  { file: 'itachi.jpg',  name: 'Itachi' },
  { file: 'eren.jpg',    name: 'Eren' },
  { file: 'gojo2.jpg',   name: 'Gojo' },
  { file: 'sasuke.jpg',  name: 'Sasuke' },
  { file: 'tanjiro.jpg', name: 'Tanjiro' },
  { file: 'toji.jpg',    name: 'Toji' },
  { file: 'zenitsu.jpg', name: 'Zenitsu' },
  { file: 'kakashi.jpg', name: 'Kakashi' },
  { file: 'zoro.jpg',    name: 'Zoro' },
  { file: 'luffy2.jpg',  name: 'Luffy' },
  { file: 'goku.jpg',    name: 'Goku' },
  { file: 'minato.jpg',  name: 'Minato' },
  { file: 'yuji.jpg',    name: 'Yuji' },
];
function initLogoFaces() {
  const img = $('logoFace');
  if (!img) return;
  let faces = LOGO_FACES.slice();
  // preload faces + their circular tab icons so the loop never shows a blank
  faces.forEach(f => {
    const pre = new Image();
    pre.onload = () => { f.ok = true; };
    pre.onerror = () => { f.ok = false; };
    pre.src = 'logo-faces/' + f.file;
    const preIcon = new Image();
    preIcon.src = 'logo-faces/circle/' + f.file.replace(/\.jpg$/i, '.png');
  });
  const alive = () => faces.filter(f => f.ok !== false);
  // tab icon follows the logo face (circular crops; different URL each swap forces refresh)
  function setFavicon(file) {
    let l = document.querySelector("link[rel~='icon']");
    if (!l) {
      l = document.createElement('link');
      l.rel = 'icon';
      document.head.appendChild(l);
    }
    l.type = 'image/png';
    l.href = 'logo-faces/circle/' + file.replace(/\.jpg$/i, '.png');
  }
  function show(f) {
    img.style.opacity = '0';
    setTimeout(() => {
      img.alt = f.name;
      img.title = f.name;
      const swap = new Image();
      swap.onload = () => { img.src = swap.src; img.style.opacity = '1'; setFavicon(f.file); };
      swap.onerror = () => { f.ok = false; next(true); }; // skip broken immediately
      swap.src = 'logo-faces/' + f.file;
    }, 300);
  }
  let i = 0;
  function next(now) {
    const list = alive();
    if (!list.length) return;
    i = (i + 1) % list.length;
    if (now) { // instant swap without fade (error path)
      const f = list[i];
      img.src = 'logo-faces/' + f.file;
      img.style.opacity = '1';
      setFavicon(f.file);
      return;
    }
    show(list[i]);
  }
  // first face is already framed in the HTML, then rotate every 5s
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  setInterval(() => { if (!document.hidden) next(); }, 5000);
}

// ---------- EVENTS ----------
function init() {
  applyAdminUI();
  loadData().then(() => { render(); }).catch(() => { seed(); render(); });
  buildCollage(); particles(); initLogoFaces();
  checkAdminRoute();
  window.addEventListener('hashchange', checkAdminRoute);

  // login modal
  $('loginBtn').addEventListener('click', tryLogin);
  $('loginClose').addEventListener('click', closeLogin);
  $('loginModal').addEventListener('click', e => { if (e.target.id === 'loginModal') closeLogin(); });
  $('loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
  $('loginUser').addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
  $('logoutBtn').addEventListener('click', logout);
  $('resetBtn').addEventListener('click', () => {
    if (!isAdmin) return;
    if (!confirm('Clear this browser\'s local tiles and reload from anime-data.json? Drafts only on this PC will be lost.')) return;
    try { localStorage.removeItem(KEY); } catch (e) {}
    location.reload();
  });
  $('syncBtn').addEventListener('click', () => {
    if (!isAdmin) return;
    const pub = list.filter(isVisible);
    const blob = new Blob([JSON.stringify(pub, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'anime-data.json'; a.click();
    toast('Downloaded ' + pub.length + ' live / ' + (list.length - pub.length) + ' drafts hidden ⬇');
  });

  // slide-in detail drawer
  $('detailClose').addEventListener('click', closeDetail);
  $('drawerBackdrop').addEventListener('click', closeDetail);
  $('drawerEdit').addEventListener('click', () => {
    if (!isAdmin || drawerId == null) return;
    const id = drawerId;
    closeDetail();
    openEdit(id);
  });

  $('addBtn').addEventListener('click', () => openAdd());
  $('fab').addEventListener('click', () => openAdd());
  $('emptyAdd').addEventListener('click', () => openAdd());
  $('modalClose').addEventListener('click', closeModal);
  $('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeLogin(); closeDetail(); } });
  $('animeSearch').addEventListener('input', onSearchInput);
  $('fRating').addEventListener('input', () => { $('ratingOut').textContent = $('fRating').value; paintStars(); });
  $('saveBtn').addEventListener('click', saveModal);
  $('googleBtn').addEventListener('click', () => {
    const t = ((picked && picked.title) || $('animeSearch').value.trim() || 'anime') + ' anime poster';
    window.open('https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(t), '_blank', 'noopener');
    toast('Pick a poster on Google → right-click → Copy image address → paste above 🔎');
  });
  $('fCover').addEventListener('input', e => {
    const u = e.target.value.trim();
    if (u) { picked = Object.assign({}, picked, { image: u }); $('preview').classList.remove('hidden'); $('pvImg').src = u; }
  });
  $('fCoverFile').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { picked = Object.assign({}, picked, { image: r.result }); $('preview').classList.remove('hidden'); $('pvImg').src = r.result; $('fCover').value = ''; toast('Photo attached from PC 📁'); };
    r.readAsDataURL(f);
  });
  $('deleteBtn').addEventListener('click', () => {
    if (!isAdmin) return;
    list = list.filter(x => x.id !== editingId); save(); render(); closeModal(); toast('Deleted 🗑');
  });

  $('viewCards').addEventListener('click', () => { view = 'cards'; localStorage.setItem('at_view', view); render(); });
  $('viewBubbles').addEventListener('click', () => { view = 'bubbles'; localStorage.setItem('at_view', view); render(); });
  $('bgToggle').addEventListener('click', () => {
    document.body.classList.toggle('bg-off');
    toast(document.body.classList.contains('bg-off') ? 'Background off 🌑' : 'Background on 🌌');
  });

  document.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('[data-filter]').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); filter = b.dataset.filter; render();
  }));
  $('sortSel').addEventListener('change', e => { sortBy = e.target.value; render(); });
  if (!SHOW_SCORES) {
    const so = $('sortSel').querySelector('option[value="score"]');
    if (so) so.remove();
  }
  $('localSearch').addEventListener('input', e => { localQuery = e.target.value.trim().toLowerCase(); render(); });

  document.querySelectorAll('[data-quick]').forEach(b => b.addEventListener('click', async () => {
    if (!isAdmin) return;
    const q = b.dataset.quick;
    if (b.disabled) return;
    b.disabled = true;
    const orig = b.textContent;
    b.textContent = '⏳…';
    try {
      const items = await jikanSearch(q);
      if (!items[0]) { openAdd(q); toast('Not found — add it manually ✍️'); return; }
      const a = items[0];
      if (isDuplicate(a)) { toast('“' + a.title + '” is already in your list 😉'); return; }
      // Open the Add form prefilled so you see the art + confirm with Save
      openAdd(a.title);
      picked = a;
      fillPicked();
      $('searchStatus').textContent = '✔ quick-picked: ' + a.title + ' — hit Save ✨';
    } catch (e) {
      // API down/blocked: still open the form with the name typed so you can paste a cover link manually
      openAdd(q);
      $('searchStatus').textContent = '⚠ ' + e.message;
      toast('Search offline — paste a cover link below 📎');
    } finally {
      b.disabled = false;
      b.textContent = orig;
    }
  }));

  paintStars();
}
document.addEventListener('DOMContentLoaded', init);
