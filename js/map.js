// ============================================
// DotoriMaps — Complete Logic
// ============================================

// ---------- Map ----------
const map = L.map('map', { zoomControl: false, rotate: false })
  .setView([37.5665, 126.9780], 13);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap'
}).addTo(map);

const acornIcon = L.divIcon({
  className: 'acorn-marker',
  html: '<div></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

const userIcon = L.divIcon({
  className: 'acorn-marker user',
  html: '<div></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

// ---------- State ----------
let currentMarker = null;
let selectedPlaceData = null;
let routingControl = null;
let nearbyRequestId = 0;
let nearbySort = 'distance';
let nearbyLast = null;         // { items, label, mode: 'mixed' | 'category' }
let userLocation = null;       // [lat, lng] once known
let userLocationKnown = false;
let lastSearchTerm = '';

// ---------- Category metadata ----------
const CATEGORY_META = {
  restaurant:       { icon: '🍴', label: 'Restaurant' },
  fast_food:        { icon: '🍔', label: 'Fast food' },
  cafe:             { icon: '☕', label: 'Café' },
  bakery:           { icon: '🥐', label: 'Bakery' },
  bar:              { icon: '🍷', label: 'Bar' },
  pub:              { icon: '🍺', label: 'Pub' },
  supermarket:      { icon: '🛒', label: 'Supermarket' },
  convenience:      { icon: '🏪', label: 'Convenience' },
  pharmacy:         { icon: '💊', label: 'Pharmacy' },
  hospital:         { icon: '🏥', label: 'Hospital' },
  clinic:           { icon: '🩺', label: 'Clinic' },
  bank:             { icon: '🏦', label: 'Bank' },
  atm:              { icon: '🏧', label: 'ATM' },
  fuel:             { icon: '⛽', label: 'Gas station' },
  parking:          { icon: '🅿️', label: 'Parking' },
  school:           { icon: '🏫', label: 'School' },
  university:       { icon: '🎓', label: 'University' },
  library:          { icon: '📚', label: 'Library' },
  park:             { icon: '🌳', label: 'Park' },
  playground:       { icon: '🛝', label: 'Playground' },
  cinema:           { icon: '🎬', label: 'Cinema' },
  theatre:          { icon: '🎭', label: 'Theatre' },
  museum:           { icon: '🏛️', label: 'Museum' },
  hotel:            { icon: '🏨', label: 'Hotel' },
  lodging:          { icon: '🛏️', label: 'Lodging' },
  place_of_worship: { icon: '⛪', label: 'Worship' },
  station:          { icon: '🚉', label: 'Station' },
  subway:           { icon: '🚇', label: 'Subway' },
  bus_stop:         { icon: '🚌', label: 'Bus stop' },
  tram_stop:        { icon: '🚊', label: 'Tram stop' },
  tourism:          { icon: '📸', label: 'Attraction' },
  viewpoint:        { icon: '👀', label: 'Viewpoint' },
  default:          { icon: '📍', label: 'Place' }
};

function metaFor(place) {
  const t = (place && place.tags) || {};
  const keys = ['amenity', 'shop', 'tourism', 'leisure', 'railway', 'highway', 'public_transport', 'aeroway'];
  for (const k of keys) {
    const v = t[k];
    if (v && CATEGORY_META[v]) return CATEGORY_META[v];
  }
  return CATEGORY_META.default;
}

// ---------- Saved places ----------
const SAVED_KEY = 'dotorimaps_saved';
function getSaved() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch (e) { return []; }
}
function setSaved(list) {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch (e) {}
}
function isSaved(place) {
  if (!place) return false;
  return getSaved().some((p) =>
    (p.id && place.id && p.id === place.id) ||
    (p.lat === place.lat && p.lon === place.lon && p.name === place.name)
  );
}
function toggleSaveCurrent() {
  if (!selectedPlaceData) return;
  const list = getSaved();
  const idx = list.findIndex((p) =>
    (p.id && selectedPlaceData.id && p.id === selectedPlaceData.id) ||
    (p.lat === selectedPlaceData.lat && p.lon === selectedPlaceData.lon && p.name === selectedPlaceData.name)
  );
  if (idx >= 0) {
    list.splice(idx, 1);
    setSaved(list);
    showToast('Removed from saved');
  } else {
    list.unshift({ ...selectedPlaceData, savedAt: Date.now() });
    setSaved(list);
    showToast('Saved 🌰');
  }
  refreshSaveButton();
}
function refreshSaveButton() {
  const btn = document.getElementById('detail-save-btn');
  if (!btn) return;
  if (isSaved(selectedPlaceData)) {
    btn.classList.add('saved');
    btn.innerHTML = '<i class="fa-solid fa-bookmark"></i> Saved';
  } else {
    btn.classList.remove('saved');
    btn.innerHTML = '<i class="fa-regular fa-bookmark"></i> Save';
  }
}

// ---------- Recent searches ----------
const RECENT_KEY = 'dotorimaps_recent';
function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { return []; }
}
function pushRecent(term) {
  if (!term) return;
  let list = getRecent().filter((t) => t.toLowerCase() !== term.toLowerCase());
  list.unshift(term);
  list = list.slice(0, 8);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) {}
  renderRecent();
}
function renderRecent() {
  const el = document.getElementById('recent-searches');
  if (!el) return;
  const list = getRecent();
  if (list.length === 0) {
    el.innerHTML = '<span class="recent-chip" style="cursor:default; color:#BBB;">No searches yet</span>';
    return;
  }
  el.innerHTML = '';
  list.forEach((term) => {
    const chip = document.createElement('span');
    chip.className = 'recent-chip';
    chip.textContent = term;
    chip.addEventListener('click', () => {
      const inp = document.getElementById('search-input');
      if (inp) {
        inp.value = term;
        searchLocations(term, 'search-results');
        switchTab(null, 'search');
      }
    });
    el.appendChild(chip);
  });
}

// ---------- Toast ----------
function showToast(text) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ---------- Modal ----------
function openModal(title, bodyHtml, buttons) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  const footer = document.getElementById('modal-footer');
  footer.innerHTML = '';
  (buttons || []).forEach((b) => {
    const btn = document.createElement('button');
    btn.className = b.primary ? 'dotori-btn' : 'small-btn';
    btn.textContent = b.label;
    btn.addEventListener('click', () => { if (b.onClick) b.onClick(); });
    footer.appendChild(btn);
  });
  document.getElementById('modal').classList.add('open');
}
function closeModal() {
  document.getElementById('modal').classList.remove('open');
}

// ---------- Tabs ----------
const TAB_LABELS = { home: 'Explore', search: 'Search', directions: 'Routes' };
function switchTab(event, tabName) {
  document.querySelectorAll('.sidebar-tab').forEach((t) => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

  if (event && event.currentTarget) {
    event.currentTarget.classList.add('active');
  } else {
    const label = TAB_LABELS[tabName];
    document.querySelectorAll('.sidebar-tab').forEach((t) => {
      if (label && t.textContent.includes(label)) t.classList.add('active');
    });
  }

  const target = document.getElementById(`tab-${tabName}`);
  if (target) target.classList.add('active');

  if (tabName === 'search') renderRecent();
  closeDetailPanel();
}

// ============================================
// AUTO-LOCATION ON LOAD
// ============================================
function autoLocateOnLoad() {
  const status = document.getElementById('nearby-status');
  if (status) status.textContent = '📍 Asking for your location…';

  if (!navigator.geolocation) {
    const fallback = [37.5665, 126.9780];
    userLocation = fallback;
    userLocationKnown = true;
    map.setView(fallback, 14);
    if (status) status.textContent = '📍 Showing places around Seoul (no location support).';
    loadMixedNearby(true);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      userLocation = [lat, lng];
      userLocationKnown = true;

      map.flyTo([lat, lng], 15, { duration: 1.2 });

      if (currentMarker) map.removeLayer(currentMarker);
      currentMarker = L.marker([lat, lng], { icon: userIcon })
        .addTo(map)
        .bindPopup('📍 You are here');

      if (status) status.textContent = '📍 Showing places near you.';
      loadMixedNearby(true);
    },
    (err) => {
      const fallback = [37.5665, 126.9780];
      userLocation = fallback;
      userLocationKnown = true;
      map.setView(fallback, 13);

      let reason = 'Location unavailable';
      if (err && err.code === 1) reason = 'Location denied';
      else if (err && err.code === 2) reason = 'Location unavailable';
      else if (err && err.code === 3) reason = 'Location timed out';

      if (status) status.textContent = `📍 ${reason}. Showing places around Seoul.`;
      loadMixedNearby(true);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

// ============================================
// MIXED NEARBY (default automatic feed)
// ============================================
async function loadMixedNearby(force) {
  const listContainer = document.getElementById('nearby-list');
  const statusEl = document.getElementById('nearby-status');
  const titleText = document.getElementById('nearby-title-text');
  const resetBtn = document.getElementById('reset-nearby-btn');
  const sortChips = document.getElementById('nearby-sort-chips');
  if (!listContainer) return;

  const requestId = ++nearbyRequestId;
  listContainer.innerHTML = '<div class="spinner"></div>';
  if (statusEl) statusEl.textContent = 'Loading nearby places…';
  if (titleText) titleText.textContent = '🌰 Nearby';
  if (resetBtn) resetBtn.style.display = 'none';
  if (sortChips) sortChips.style.display = 'flex';

  const center = userLocation
    ? L.latLng(userLocation[0], userLocation[1])
    : map.getCenter();
  const lat = center.lat;
  const lng = center.lng;
  const radius = 1500;

  const query = `[out:json][timeout:20];(
    node[amenity=cafe](around:${radius},${lat},${lng});
    node[amenity=restaurant](around:${radius},${lat},${lng});
    node[amenity=fast_food](around:${radius},${lat},${lng});
    node[shop=supermarket](around:${radius},${lat},${lng});
    node[shop=convenience](around:${radius},${lat},${lng});
    node[leisure=park](around:${radius},${lat},${lng});
    node[amenity=pharmacy](around:${radius},${lat},${lng});
    node[amenity=bank](around:${radius},${lat},${lng});
    node[amenity=atm](around:${radius},${lat},${lng});
    node[public_transport=station](around:${radius},${lat},${lng});
  );out body 80;`;

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  let data = null;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { method: 'POST', body: query });
      if (!res.ok) continue;
      data = await res.json();
      if (data && data.elements) break;
    } catch (e) { console.warn(`Overpass failed: ${url}`); }
  }

  if (requestId !== nearbyRequestId) return;

  const seen = new Set();
  const places = (data && data.elements ? data.elements : [])
    .filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    })
    .map((p) => {
      p.distance = map.distance([lat, lng], [p.lat, p.lon]);
      return p;
    });

  nearbyLast = { items: places, label: 'Nearby', mode: 'mixed' };
  if (statusEl) statusEl.textContent = places.length > 0
    ? `${places.length} places within 1.5 km — tap a category above to narrow.`
    : 'No places found nearby. Try moving the map or tapping a category.';

  renderMixedNearbyList();
}

function renderMixedNearbyList() {
  const listContainer = document.getElementById('nearby-list');
  if (!listContainer || !nearbyLast) return;

  const { items } = nearbyLast;

  if (!items || items.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state">
        <span class="em">Nothing found nearby</span>
        Move the map or pick a category above.
      </div>`;
    return;
  }

  const sorted = [...items].sort((a, b) => {
    if (nearbySort === 'name') {
      const an = (a.tags && a.tags.name) || '';
      const bn = (b.tags && b.tags.name) || '';
      return an.localeCompare(bn);
    }
    return a.distance - b.distance;
  });

  listContainer.innerHTML = '';
  sorted.forEach((place) => {
    const name = (place.tags && place.tags.name) || (place.tags && place.tags.operator) || 'Unnamed Place';
    const distance = place.distance > 1000
      ? (place.distance / 1000).toFixed(1) + ' km'
      : place.distance.toFixed(0) + ' m';
    const meta = metaFor(place);

    const card = document.createElement('div');
    card.className = 'place-card';
    card.innerHTML = `
      <div class="place-card-icon">${meta.icon}</div>
      <div class="place-card-body">
        <h4></h4>
        <p></p>
      </div>`;
    card.querySelector('h4').textContent = name;
    card.querySelector('p').textContent = `${meta.label} · ${distance}`;
    card.addEventListener('click', () => showDetailForOSM(place, name, meta.label, distance));
    listContainer.appendChild(card);
  });
}

// ============================================
// CATEGORY-FILTERED NEARBY
// ============================================
const NEARBY_QUERIES = {
  restaurant:  { q: 'amenity=restaurant', label: 'Restaurants' },
  cafe:        { q: 'amenity=cafe', label: 'Cafés' },
  transit:     { q: 'public_transport=station', label: 'Transit' },
  supermarket: { q: 'shop=supermarket', label: 'Groceries' },
  park:        { q: 'leisure=park', label: 'Parks' },
  pharmacy:    { q: 'amenity=pharmacy', label: 'Pharmacies' }
};

async function findNearby(category) {
  const listContainer = document.getElementById('nearby-list');
  const statusEl = document.getElementById('nearby-status');
  const titleText = document.getElementById('nearby-title-text');
  const resetBtn = document.getElementById('reset-nearby-btn');
  if (!listContainer) return;

  const meta = NEARBY_QUERIES[category];
  if (!meta) return;

  const requestId = ++nearbyRequestId;
  listContainer.innerHTML = '<div class="spinner"></div>';
  if (titleText) titleText.textContent = `🌰 Nearby ${meta.label}`;
  if (statusEl) statusEl.textContent = '';
  if (resetBtn) resetBtn.style.display = '';

  const center = userLocation
    ? L.latLng(userLocation[0], userLocation[1])
    : map.getCenter();
  const lat = center.lat;
  const lng = center.lng;
  const radius = 2000;

  const query = `[out:json][timeout:15];node[${meta.q}](around:${radius},${lat},${lng});out body 30;`;

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  let data = null;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { method: 'POST', body: query });
      if (!res.ok) continue;
      data = await res.json();
      if (data && data.elements) break;
    } catch (e) { console.warn(`Overpass failed: ${url}`); }
  }

  if (requestId !== nearbyRequestId) return;

  const places = (data && data.elements ? data.elements : []).map((p) => {
    p.distance = map.distance([lat, lng], [p.lat, p.lon]);
    return p;
  });

  nearbyLast = { items: places, label: meta.label, mode: 'category' };
  renderNearbyList();
}

function renderNearbyList() {
  const listContainer = document.getElementById('nearby-list');
  if (!listContainer || !nearbyLast) return;

  const { items, label } = nearbyLast;

  if (!items || items.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state">
        <span class="em">No ${label} found nearby</span>
        Move the map, or tap "Back to mixed nearby".
      </div>`;
    return;
  }

  const sorted = [...items].sort((a, b) => {
    if (nearbySort === 'name') {
      const an = (a.tags && a.tags.name) || '';
      const bn = (b.tags && b.tags.name) || '';
      return an.localeCompare(bn);
    }
    return a.distance - b.distance;
  });

  listContainer.innerHTML = '';
  sorted.forEach((place) => {
    const name = (place.tags && place.tags.name) || 'Unnamed Place';
    const distance = place.distance > 1000
      ? (place.distance / 1000).toFixed(1) + ' km'
      : place.distance.toFixed(0) + ' m';
    const meta = metaFor(place);

    const card = document.createElement('div');
    card.className = 'place-card';
    card.innerHTML = `
      <div class="place-card-icon">${meta.icon}</div>
      <div class="place-card-body">
        <h4></h4>
        <p></p>
      </div>`;
    card.querySelector('h4').textContent = name;
    card.querySelector('p').textContent = `${meta.label} · ${distance}`;
    card.addEventListener('click', () => showDetailForOSM(place, name, meta.label, distance));
    listContainer.appendChild(card);
  });
}

// ============================================
// DETAIL PANEL
// ============================================
function showDetailForOSM(place, name, category, distance) {
  selectedPlaceData = {
    id: place.id || null,
    lat: place.lat,
    lon: place.lon,
    name,
    category,
    distance,
    tags: place.tags || {}
  };

  map.flyTo([place.lat, place.lon], 17, { duration: 0.8 });
  if (currentMarker) map.removeLayer(currentMarker);
  currentMarker = L.marker([place.lat, place.lon], { icon: acornIcon })
    .addTo(map)
    .bindPopup(name)
    .openPopup();

  renderDetailPanel();
}

function showDetailForCoords(lat, lon, name, category) {
  selectedPlaceData = {
    id: null, lat, lon, name,
    category: category || 'Location',
    distance: null,
    tags: {}
  };
  renderDetailPanel();
}

function renderDetailPanel() {
  if (!selectedPlaceData) return;
  const p = selectedPlaceData;
  const t = p.tags || {};
  const meta = metaFor({ tags: t });
  const displayName = p.name || t.name || 'Unnamed Place';
  const category = meta.label;

  document.getElementById('detail-name').textContent = displayName;
  document.getElementById('detail-category').textContent = category;

  const photoEl = document.getElementById('detail-photo');
  photoEl.innerHTML = `<span>${meta.icon}</span>`;
  const photoUrl = buildPhotoUrl(t);
  if (photoUrl) {
    const img = new Image();
    img.onload = () => { photoEl.innerHTML = ''; photoEl.appendChild(img); };
    img.alt = displayName;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    img.src = photoUrl;
  }

  const distance = p.distance
    ? (p.distance > 1000 ? (p.distance / 1000).toFixed(1) + ' km' : p.distance.toFixed(0) + ' m')
    : '';
  const address = formatAddress(t);
  document.getElementById('detail-info').textContent =
    [distance ? distance + ' away' : '', address].filter(Boolean).join(' · ') ||
    'No further info available';

  const facts = document.getElementById('detail-facts');
  facts.innerHTML = '';

  const addFact = (icon, value, href) => {
    if (!value) return;
    const row = document.createElement('div');
    row.className = 'detail-fact';
    const iconSpan = document.createElement('span');
    iconSpan.className = 'fact-icon';
    iconSpan.textContent = icon;
    row.appendChild(iconSpan);

    const valueSpan = document.createElement('span');
    if (href) {
      const a = document.createElement('a');
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = value;
      valueSpan.appendChild(a);
    } else {
      valueSpan.textContent = value;
    }
    row.appendChild(valueSpan);
    facts.appendChild(row);
  };

  if (address) addFact('📮', address);
  if (t.phone || t['contact:phone']) addFact('📞', t.phone || t['contact:phone']);
  const website = t.website || t['contact:website'];
  if (website) addFact('🌐', website, /^https?:\/\//i.test(website) ? website : 'https://' + website);
  if (t.opening_hours) addFact('🕒', t.opening_hours);
  if (t.cuisine) addFact('🍽️', t.cuisine);
  if (t.wikipedia) addFact('📖', 'Wikipedia article', 'https://en.wikipedia.org/wiki/' + encodeURIComponent(t.wikipedia));
  addFact('🧭', `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`);

  refreshSaveButton();

  const nearbyEl = document.getElementById('detail-nearby');
  const nearbyGrid = document.getElementById('detail-nearby-grid');
  nearbyGrid.innerHTML = '';
  nearbyEl.style.display = 'none';

  fetchNearbySummary(p.lat, p.lon).then((counts) => {
    const entries = Object.entries(counts).filter(([, c]) => c > 0);
    if (entries.length === 0) return;
    entries.sort((a, b) => b[1] - a[1]);
    nearbyEl.style.display = '';
    entries.forEach(([cat, count]) => {
      const chip = document.createElement('button');
      chip.className = 'detail-nearby-chip';
      const catMeta = CATEGORY_META[cat] || CATEGORY_META.default;
      chip.innerHTML = `${catMeta.icon} ${catMeta.label} <span class="muted">${count}</span>`;
      chip.addEventListener('click', () => {
        switchTab(null, 'home');
        map.flyTo([p.lat, p.lon], 15, { duration: 0.8 });
        const mapped = mapToMainCategory(cat);
        if (mapped) findNearby(mapped);
        else showToast(`Showing ${catMeta.label} not yet supported here`);
      });
      nearbyGrid.appendChild(chip);
    });
  });

  document.getElementById('detail-panel').classList.add('open');
}

function mapToMainCategory(cat) {
  const m = {
    restaurant: 'restaurant', fast_food: 'restaurant',
    cafe: 'cafe', bakery: 'cafe',
    supermarket: 'supermarket', convenience: 'supermarket',
    park: 'park', playground: 'park',
    pharmacy: 'pharmacy',
    station: 'transit', subway: 'transit', bus_stop: 'transit',
    public_transport: 'transit'
  };
  return m[cat] || null;
}

function formatAddress(t) {
  const bits = [
    t['addr:housenumber'],
    t['addr:street'],
    t['addr:suburb'] || t['addr:neighbourhood'],
    t['addr:city'] || t['addr:town'] || t['addr:village'],
    t['addr:postcode']
  ].filter(Boolean);
  return bits.join(' ');
}

function buildPhotoUrl(t) {
  if (t.wikimedia_commons && /^File:/.test(t.wikimedia_commons)) {
    const file = t.wikimedia_commons.replace(/^File:/, '').replace(/ /g, '_');
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=200`;
  }
  if (t.image && /^https?:\/\//i.test(t.image)) return t.image;
  return null;
}

async function fetchNearbySummary(lat, lon) {
  const radius = 500;
  const q = `[out:json][timeout:10];(
    node[amenity=restaurant](around:${radius},${lat},${lon});
    node[amenity=cafe](around:${radius},${lat},${lon});
    node[shop=supermarket](around:${radius},${lat},${lon});
    node[amenity=pharmacy](around:${radius},${lat},${lon});
    node[leisure=park](around:${radius},${lat},${lon});
  );out tags 300;`;
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: q });
    if (!res.ok) return {};
    const data = await res.json();
    const counts = { restaurant: 0, cafe: 0, supermarket: 0, pharmacy: 0, park: 0 };
    (data.elements || []).forEach((el) => {
      const tg = el.tags || {};
      if (tg.amenity === 'restaurant') counts.restaurant++;
      else if (tg.amenity === 'cafe') counts.cafe++;
      else if (tg.shop === 'supermarket') counts.supermarket++;
      else if (tg.amenity === 'pharmacy') counts.pharmacy++;
      else if (tg.leisure === 'park') counts.park++;
    });
    return counts;
  } catch (e) { return {}; }
}

function closeDetailPanel() {
  const el = document.getElementById('detail-panel');
  if (el) el.classList.remove('open');
}

// ============================================
// SEARCH
// ============================================
const searchTimeouts = {};

async function searchLocations(query, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!query || query.trim().length < 2) {
    container.style.display = 'none';
    return;
  }

  container.innerHTML = '<div class="search-result-item">Searching…</div>';
  container.style.display = 'flex';

  clearTimeout(searchTimeouts[containerId]);
  searchTimeouts[containerId] = setTimeout(async () => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=6&addressdetails=1&q=${encodeURIComponent(query)}`,
        { headers: { 'Accept': 'application/json', 'User-Agent': 'DotoriMaps/1.0' } }
      );
      const data = await res.json();

      if (!data || data.length === 0) {
        container.innerHTML = '<div class="search-result-item">No results found</div>';
        return;
      }

      container.innerHTML = '';
      data.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'search-result-item';
        const primary = (item.display_name || '').split(',')[0];
        const rest = (item.display_name || '').split(',').slice(1).join(', ').trim();
        const strong = document.createElement('div');
        strong.textContent = primary;
        row.appendChild(strong);
        if (rest) {
          const small = document.createElement('small');
          small.textContent = rest;
          row.appendChild(small);
        }
        row.addEventListener('click', () => {
          selectSearchResult(
            parseFloat(item.lat),
            parseFloat(item.lon),
            item.display_name,
            containerId
          );
        });
        container.appendChild(row);
      });
    } catch (err) {
      container.innerHTML = '<div class="search-result-item">Search failed</div>';
    }
  }, 400);
}

// Search specifically near the user (in the home tab)
async function searchNearMe(query) {
  const container = document.getElementById('home-search-results');
  if (!container) return;

  if (!query || query.trim().length < 2) {
    container.style.display = 'none';
    return;
  }

  container.innerHTML = '<div class="search-result-item">Searching…</div>';
  container.style.display = 'flex';

  clearTimeout(searchTimeouts['home-search-results']);
  searchTimeouts['home-search-results'] = setTimeout(async () => {
    try {
      const bias = userLocation ? `&viewbox=${userLocation[1] - 0.1},${userLocation[0] + 0.1},${userLocation[1] + 0.1},${userLocation[0] - 0.1}&bounded=0` : '';
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=6&addressdetails=1&q=${encodeURIComponent(query)}${bias}`,
        { headers: { 'Accept': 'application/json', 'User-Agent': 'DotoriMaps/1.0' } }
      );
      const data = await res.json();

      if (!data || data.length === 0) {
        container.innerHTML = '<div class="search-result-item">No results found</div>';
        return;
      }

      container.innerHTML = '';
      data.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'search-result-item';
        const primary = (item.display_name || '').split(',')[0];
        const rest = (item.display_name || '').split(',').slice(1).join(', ').trim();
        const strong = document.createElement('div');
        strong.textContent = primary;
        row.appendChild(strong);
        if (rest) {
          const small = document.createElement('small');
          small.textContent = rest;
          row.appendChild(small);
        }
        row.addEventListener('click', () => {
          selectSearchResult(
            parseFloat(item.lat),
            parseFloat(item.lon),
            item.display_name,
            'home-search-results'
          );
        });
        container.appendChild(row);
      });
    } catch (err) {
      container.innerHTML = '<div class="search-result-item">Search failed</div>';
    }
  }, 400);
}

function searchKeyNav(event, containerId) {
  const container = document.getElementById(containerId);
  if (!container || container.style.display === 'none') return;
  const items = [...container.querySelectorAll('.search-result-item')].filter(
    (el) => el.textContent !== 'Searching…' && el.textContent !== 'No results found'
  );
  if (items.length === 0) return;

  const idx = items.findIndex((el) => el.classList.contains('active'));

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    items.forEach((el) => el.classList.remove('active'));
    items[(idx + 1) % items.length].classList.add('active');
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    items.forEach((el) => el.classList.remove('active'));
    items[(idx - 1 + items.length) % items.length].classList.add('active');
  } else if (event.key === 'Enter') {
    const active = container.querySelector('.search-result-item.active');
    if (active) { event.preventDefault(); active.click(); }
  } else if (event.key === 'Escape') {
    container.style.display = 'none';
  }
}

function selectSearchResult(lat, lon, name, containerId) {
  const shortName = (name || '').split(',')[0];
  pushRecent(shortName);

  if (currentMarker) map.removeLayer(currentMarker);
  map.flyTo([lat, lon], 16);

  currentMarker = L.marker([lat, lon], { icon: acornIcon })
    .addTo(map)
    .bindPopup(shortName)
    .openPopup();

  const inputId = containerId.replace('-results', '-input');
  const inputEl = document.getElementById(inputId);
  const containerEl = document.getElementById(containerId);
  if (inputEl) inputEl.value = shortName;
  if (containerEl) containerEl.style.display = 'none';

  reverseGeocodeAndShow(lat, lon, shortName);
}

// Click map → reverse geocode
map.on('click', async (e) => {
  const { lat, lng } = e.latlng;
  if (currentMarker) map.removeLayer(currentMarker);
  currentMarker = L.marker([lat, lng], { icon: acornIcon }).addTo(map);
  await reverseGeocodeAndShow(lat, lng, 'Dropped pin');
});

async function reverseGeocodeAndShow(lat, lon, fallbackName) {
  showDetailForCoords(lat, lon, fallbackName, 'Location');
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&extratags=1`,
      { headers: { 'Accept': 'application/json', 'User-Agent': 'DotoriMaps/1.0' } }
    );
    const data = await res.json();
    if (data && data.display_name) {
      const name = (data.name && data.name !== '') ? data.name : data.display_name.split(',')[0];
      const cat = data.category || data.type || 'Location';
      const addr = data.address || {};
      selectedPlaceData = {
        id: data.osm_id ? `node/${data.osm_id}` : null,
        lat, lon,
        name,
        category: cat,
        distance: null,
        tags: {
          'addr:housenumber': addr.house_number,
          'addr:street': addr.road,
          'addr:suburb': addr.suburb || addr.neighbourhood,
          'addr:city': addr.city || addr.town || addr.village,
          'addr:postcode': addr.postcode,
          phone: data.extratags && data.extratags.phone,
          website: data.extratags && data.extratags.website,
          opening_hours: data.extratags && data.extratags.opening_hours,
          wikipedia: data.extratags && data.extratags.wikipedia
        }
      };
      renderDetailPanel();
    }
  } catch (e) { /* keep optimistic render */ }
}

// ============================================
// ROUTING
// ============================================
async function getDirections() {
  const startInput = document.getElementById('start-input');
  const endInput = document.getElementById('end-input');
  if (!startInput || !endInput) return;

  const start = startInput.value.trim();
  const end = endInput.value.trim();
  if (!start || !end) { showToast('Please enter both start and destination'); return; }

  const fetchCoords = async (q) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
        { headers: { 'Accept': 'application/json', 'User-Agent': 'DotoriMaps/1.0' } }
      );
      const data = await res.json();
      return data.length > 0 ? [parseFloat(data[0].lat), parseFloat(data[0].lon)] : null;
    } catch (e) { return null; }
  };

  const [startCoords, endCoords] = await Promise.all([fetchCoords(start), fetchCoords(end)]);
  if (!startCoords || !endCoords) { showToast('Could not find one of the locations'); return; }

  if (routingControl) {
    try { map.removeControl(routingControl); } catch (e) {}
    routingControl = null;
  }
  if (currentMarker) { map.removeLayer(currentMarker); currentMarker = null; }

  routingControl = L.Routing.control({
    waypoints: [L.latLng(...startCoords), L.latLng(...endCoords)],
    router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
    lineOptions: { styles: [{ color: '#FF9EC4', weight: 5, opacity: 0.85 }] },
    createMarker: function (i, wp) { return L.marker(wp.latLng, { icon: acornIcon }); },
    show: false,
    addWaypoints: false,
    routeWhileDragging: false
  }).addTo(map);

  routingControl.on('routesfound', (e) => {
    const route = e.routes[0];
    const summary = route.summary;
    const dist = summary.totalDistance >= 1000
      ? (summary.totalDistance / 1000).toFixed(2) + ' km'
      : summary.totalDistance.toFixed(0) + ' m';
    const mins = Math.round(summary.totalTime / 60);
    const div = document.getElementById('route-summary');
    div.style.display = '';
    div.innerHTML = `<span class="em">${dist} · ${mins} min</span>via ${route.name || 'fastest route'}`;
    document.getElementById('clear-route-btn').style.display = '';
  });

  routingControl.on('routingerror', () => {
    showToast('Could not calculate a route');
  });
}

function clearRoute() {
  if (routingControl) {
    try { map.removeControl(routingControl); } catch (e) {}
    routingControl = null;
  }
  const summary = document.getElementById('route-summary');
  if (summary) { summary.style.display = 'none'; summary.innerHTML = ''; }
  const btn = document.getElementById('clear-route-btn');
  if (btn) btn.style.display = 'none';
}

function routeToSelected() {
  if (!selectedPlaceData) return;
  switchTab(null, 'directions');
  const endInput = document.getElementById('end-input');
  if (endInput) endInput.value = selectedPlaceData.name;
  closeDetailPanel();
  if (userLocation) {
    const startInput = document.getElementById('start-input');
    if (startInput && !startInput.value) {
      startInput.value = `${userLocation[0].toFixed(5)}, ${userLocation[1].toFixed(5)}`;
    }
  }
}

// ============================================
// SAVED PLACES DRAWER
// ============================================
function openSavedDrawer() {
  const list = getSaved();
  const body = document.createElement('div');
  if (list.length === 0) {
    body.innerHTML = `<div class="empty-state"><span class="em">No saved places yet</span>Tap 🔖 Save on any place to keep it here.</div>`;
  } else {
    list.forEach((place) => {
      const card = document.createElement('div');
      card.className = 'place-card';
      card.style.marginBottom = '8px';
      card.innerHTML = `
        <div class="place-card-icon">🌰</div>
        <div class="place-card-body">
          <h4></h4>
          <p></p>
        </div>`;
      card.querySelector('h4').textContent = place.name || 'Saved place';
      card.querySelector('p').textContent = `${place.lat.toFixed(4)}, ${place.lon.toFixed(4)}`;
      card.addEventListener('click', () => {
        closeModal();
        if (currentMarker) map.removeLayer(currentMarker);
        map.flyTo([place.lat, place.lon], 17);
        currentMarker = L.marker([place.lat, place.lon], { icon: acornIcon })
          .addTo(map).bindPopup(place.name || 'Saved place').openPopup();
        reverseGeocodeAndShow(place.lat, place.lon, place.name);
      });
      body.appendChild(card);
    });
  }

  openModal(`🔖 Saved places (${list.length})`, '', [
    { label: 'Close', onClick: closeModal }
  ]);
  document.getElementById('modal-body').innerHTML = '';
  document.getElementById('modal-body').appendChild(body);
}

// ============================================
// SHARE
// ============================================
async function shareCurrent() {
  if (!selectedPlaceData) return;
  const url = `https://www.openstreetmap.org/?mlat=${selectedPlaceData.lat}&mlon=${selectedPlaceData.lon}#map=17/${selectedPlaceData.lat}/${selectedPlaceData.lon}`;
  const text = `${selectedPlaceData.name} — ${url}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: selectedPlaceData.name, text: selectedPlaceData.name, url });
      return;
    } catch (e) { /* fall through */ }
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('Link copied');
  } catch (e) {
    showToast('Could not share');
  }
}

// ============================================
// LOGIN / AUTH
// ============================================
async function initAuthUI() {
  try {
    const profile = await DotoriStorage.getMyAcorn();
    if (profile) updateLoginButton(profile);
  } catch (e) {}
}

function updateLoginButton(profile) {
  const btn = document.getElementById('map-login-btn');
  if (!btn) return;
  if (profile) {
    btn.textContent = profile.mini_me || '🌰';
    btn.title = `Logged in as ${profile.nickname}`;
    btn.style.background = '#FFF8F0';
  } else {
    btn.textContent = '👤';
    btn.title = 'Login (optional)';
    btn.style.background = '#FFF';
  }
}

async function openMapLogin() {
  const savedId = localStorage.getItem('dotori_my_id');

  if (savedId) {
    openModal('Account', `You're logged in as <strong>${savedId}</strong>.<br><br>
      <span style="color:#888;font-size:11px;">Login only unlocks the ability to send places to friends in the main app. Maps works fully without it.</span>`, [
      { label: 'Cancel', onClick: closeModal },
      { label: 'Log out', primary: true, onClick: async () => {
        try {
          await DotoriStorage.logout();
          updateLoginButton(null);
          closeModal();
          showToast('Logged out');
        } catch (e) { showToast('Logout failed'); }
      }}
    ]);
    return;
  }

  openModal('Login (optional)', `
    <div class="input-group" style="margin-bottom:12px;">
      <label>Dotori ID</label>
      <input type="text" id="login-id-input" class="search-box" placeholder="e.g. dotori-t7vl" autocomplete="off">
    </div>
    <p style="color:#888;font-size:11px;line-height:1.6;">
      Login is not required to use the map. It only lets you send a place as a 쪽지 to a friend in 도토리숲.
    </p>
  `, [
    { label: 'Cancel', onClick: closeModal },
    { label: 'Login', primary: true, onClick: async () => {
      const id = document.getElementById('login-id-input').value.trim();
      if (!id) return;
      try {
        const profile = await DotoriStorage.loginByDotoriId(id);
        if (profile) {
          updateLoginButton(profile);
          closeModal();
          showToast(`Welcome, ${profile.nickname}!`);
        } else {
          showToast('ID not found');
        }
      } catch (err) {
        showToast('Login failed: ' + (err.message || ''));
      }
    }}
  ]);

  setTimeout(() => {
    const inp = document.getElementById('login-id-input');
    if (inp) inp.focus();
  }, 60);
}

// ============================================
// FIND MY LOCATION (manual button)
// ============================================
function findMyLocation() {
  if (!navigator.geolocation) { showToast('Geolocation not supported'); return; }
  const btn = document.getElementById('locate-btn');
  if (btn) btn.textContent = '⏳';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      userLocation = [lat, lng];
      userLocationKnown = true;
      map.flyTo([lat, lng], 16, { duration: 1.5 });
      if (currentMarker) map.removeLayer(currentMarker);
      currentMarker = L.marker([lat, lng], { icon: userIcon })
        .addTo(map)
        .bindPopup('📍 You are here')
        .openPopup();
      if (btn) btn.textContent = '📍';

      // Reload mixed nearby from the new position
      loadMixedNearby(true);
    },
    () => { showToast('Could not get location.'); if (btn) btn.textContent = '📍'; },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// ============================================
// KEYBOARD
// ============================================
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeDetailPanel();
    closeModal();
    document.querySelectorAll('.search-results-list').forEach((el) => el.style.display = 'none');
    clearRoute();
  }
  if (e.key === '/' && (!document.activeElement || document.activeElement.tagName !== 'INPUT')) {
    e.preventDefault();
    switchTab(null, 'search');
    setTimeout(() => {
      const inp = document.getElementById('search-input');
      if (inp) inp.focus();
    }, 60);
  }
});

// ============================================
// SORT CHIPS
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  const chips = document.getElementById('nearby-sort-chips');
  if (!chips) return;
  chips.querySelectorAll('.sort-chip').forEach((c) => {
    c.addEventListener('click', (e) => {
      e.stopPropagation();
      nearbySort = c.dataset.sort;
      chips.querySelectorAll('.sort-chip').forEach((x) => x.classList.remove('active'));
      c.classList.add('active');
      if (nearbyLast && nearbyLast.mode === 'mixed') renderMixedNearbyList();
      else renderNearbyList();
    });
  });
});

// ============================================
// TOOLBOX WIRING
// ============================================
document.getElementById('map-login-btn')?.addEventListener('click', openMapLogin);
document.getElementById('locate-btn')?.addEventListener('click', findMyLocation);
document.getElementById('saved-btn')?.addEventListener('click', openSavedDrawer);
document.getElementById('zoom-in')?.addEventListener('click', () => map.zoomIn());
document.getElementById('zoom-out')?.addEventListener('click', () => map.zoomOut());

// ============================================
// INIT
// ============================================
renderRecent();

// Fire auto-location as soon as the DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    autoLocateOnLoad();
    initAuthUI();
  });
} else {
  autoLocateOnLoad();
  initAuthUI();
}