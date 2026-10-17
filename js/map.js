// ============================================
// DotoriMaps — Complete Logic
// ============================================

const map = L.map('map', { zoomControl: false, rotate: false }).setView([37.5665, 126.9780], 13);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap'
}).addTo(map);

const acornIcon = L.divIcon({
  className: 'acorn-marker',
  html: '<div></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9]
});

let currentMarker = null;
let selectedPlaceData = null;
let routingControl = null;
let nearbyRequestId = 0;
let nearbySort = 'distance';
let nearbyLast = null; // { items, label }

// ---------- Icons per category ----------
const CATEGORY_META = {
  restaurant:     { icon: '🍴', label: 'Restaurant' },
  cafe:           { icon: '☕', label: 'Café' },
  fast_food:      { icon: '🍔', label: 'Fast food' },
  bar:            { icon: '🍷', label: 'Bar' },
  pub:            { icon: '🍺', label: 'Pub' },
  bakery:         { icon: '🥐', label: 'Bakery' },
  supermarket:    { icon: '🛒', label: 'Supermarket' },
  convenience:    { icon: '🏪', label: 'Convenience' },
  pharmacy:       { icon: '💊', label: 'Pharmacy' },
  hospital:       { icon: '🏥', label: 'Hospital' },
  bank:           { icon: '🏦', label: 'Bank' },
  atm:            { icon: '🏧', label: 'ATM' },
  fuel:           { icon: '⛽', label: 'Fuel' },
  parking:        { icon: '🅿️', label: 'Parking' },
  school:         { icon: '🏫', label: 'School' },
  university:     { icon: '🎓', label: 'University' },
  library:        { icon: '📚', label: 'Library' },
  park:           { icon: '🌳', label: 'Park' },
  playground:     { icon: '🛝', label: 'Playground' },
  cinema:         { icon: '🎬', label: 'Cinema' },
  theatre:        { icon: '🎭', label: 'Theatre' },
  museum:         { icon: '🏛️', label: 'Museum' },
  hotel:          { icon: '🏨', label: 'Hotel' },
  lodging:        { icon: '🛏️', label: 'Lodging' },
  place_of_worship: { icon: '⛪', label: 'Place of worship' },
  station:        { icon: '🚉', label: 'Station' },
  bus_stop:       { icon: '🚌', label: 'Bus stop' },
  subway:         { icon: '🚇', label: 'Subway' },
  tourism:        { icon: '📸', label: 'Attraction' },
  viewpoint:      { icon: '👀', label: 'Viewpoint' },
  default:        { icon: '📍', label: 'Place' }
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

// ---------- Saved places (localStorage) ----------
const SAVED_KEY = 'dotorimaps_saved';
function getSaved() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch (e) { return []; }
}
function setSaved(list) {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch (e) {}
}
function isSaved(place) {
  if (!place) return false;
  const list = getSaved();
  return list.some((p) => p.id === place.id || (p.lat === place.lat && p.lon === place.lon && p.name === place.name));
}
function saveCurrent() {
  if (!selectedPlaceData) return;
  const list = getSaved();
  const exists = list.some((p) => p.id === selectedPlaceData.id && p.name === selectedPlaceData.name);
  if (!exists) {
    list.unshift({ ...selectedPlaceData, savedAt: Date.now() });
    setSaved(list);
    showBubble('Saved 🌰');
  }
}
function unsaveCurrent() {
  if (!selectedPlaceData) return;
  const list = getSaved().filter((p) => !(p.id === selectedPlaceData.id && p.name === selectedPlaceData.name));
  setSaved(list);
  showBubble('Removed from saved');
}
function toggleSaveCurrent() {
  if (isSaved(selectedPlaceData)) unsaveCurrent(); else saveCurrent();
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
    el.innerHTML = '<span class="recent-chip" style="cursor: default; color: #BBB;">No searches yet</span>';
    return;
  }
  el.innerHTML = '';
  list.forEach((term) => {
    const chip = document.createElement('span');
    chip.className = 'recent-chip';
    chip.textContent = term;
    chip.addEventListener('click', () => {
      const input = document.getElementById('search-input');
      if (input) {
        input.value = term;
        searchLocations(term, 'search-results');
      }
    });
    el.appendChild(chip);
  });
}

// ---------- Share ----------
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
    showBubble('Link copied to clipboard');
  } catch (e) {
    showBubble('Could not share');
  }
}

function recenterCurrent() {
  if (!selectedPlaceData) return;
  map.flyTo([selectedPlaceData.lat, selectedPlaceData.lon], 17, { duration: 0.8 });
}

// ---------- Tab switching ----------
function switchTab(event, tabName) {
  document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  if (event && event.currentTarget) {
    event.currentTarget.classList.add('active');
  } else {
    const labels = { home: 'Home', search: 'Search', directions: 'Routes', saved: 'Saved' };
    const label = labels[tabName];
    document.querySelectorAll('.sidebar-tab').forEach((t) => {
      if (label && t.textContent.trim().includes(label)) t.classList.add('active');
    });
  }

  const target = document.getElementById(`tab-${tabName}`);
  if (target) target.classList.add('active');

  closeDetailPanel();
  if (tabName === 'search') renderRecent();
}

// ---------- Find My Location ----------
function findMyLocation() {
  if (!navigator.geolocation) { alert('Geolocation not supported'); return; }
  const btn = document.getElementById('locate-btn');
  if (btn) btn.innerText = '⏳';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      map.flyTo([lat, lng], 16, { duration: 1.5 });
      if (currentMarker) map.removeLayer(currentMarker);
      currentMarker = L.marker([lat, lng], { icon: acornIcon }).addTo(map).bindPopup('📍 You are here').openPopup();
      if (btn) btn.innerText = '📍';
    },
    () => { alert('Could not get location.'); if (btn) btn.innerText = '📍'; },
    { enableHighAccuracy: true }
  );
}

// ---------- Nearby ----------
async function findNearby(category) {
  const listContainer = document.getElementById('nearby-list');
  const title = document.getElementById('nearby-title');
  if (!listContainer) return;

  const requestId = ++nearbyRequestId;
  listContainer.innerHTML = '<div class="spinner"></div>';

  const center = map.getCenter();
  const lat = center.lat;
  const lng = center.lng;
  const radius = 2000;

  let osmTag = '', label = '';
  if (category === 'restaurant') { osmTag = 'amenity=restaurant'; label = 'Restaurants'; }
  else if (category === 'cafe') { osmTag = 'amenity=cafe'; label = 'Cafes'; }
  else if (category === 'transit_station') { osmTag = 'public_transport=station'; label = 'Transit'; }
  else if (category === 'supermarket') { osmTag = 'shop=supermarket'; label = 'Shopping'; }

  if (title) title.innerText = `🌰 Nearby ${label}`;

  const query = `[out:json];node[${osmTag}](around:${radius},${lat},${lng});out body 20;`;

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
    } catch (e) { console.warn(`Failed fetching from ${url}`); }
  }

  if (requestId !== nearbyRequestId) return;

  const places = (data && data.elements ? data.elements : []).map((place) => {
    place.distance = map.distance([lat, lng], [place.lat, place.lon]);
    return place;
  });

  nearbyLast = { items: places, label };

  renderNearbyList();

  // Ensure sort chips are shown above the list
  if (title && !document.getElementById('nearby-sort-chips')) {
    const chips = document.createElement('span');
    chips.className = 'sort-chips';
    chips.id = 'nearby-sort-chips';
    chips.innerHTML = `
      <button class="sort-chip active" data-sort="distance">Distance</button>
      <button class="sort-chip" data-sort="name">Name</button>
    `;
    title.appendChild(chips);
    chips.querySelectorAll('.sort-chip').forEach((c) => {
      c.addEventListener('click', () => {
        nearbySort = c.dataset.sort;
        chips.querySelectorAll('.sort-chip').forEach((x) => x.classList.remove('active'));
        c.classList.add('active');
        renderNearbyList();
      });
    });
  }
}

function renderNearbyList() {
  const listContainer = document.getElementById('nearby-list');
  if (!listContainer || !nearbyLast) return;

  const { items, label } = nearbyLast;
  if (!items || items.length === 0) {
    listContainer.innerHTML = '<p style="font-size: 11px; color: #888; text-align: center; padding: 20px;">No places found nearby.</p>';
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
      ? (place.distance / 1000).toFixed(1) + 'km'
      : place.distance.toFixed(0) + 'm';
    const meta = metaFor(place);

    const card = document.createElement('div');
    card.className = 'place-card';
    card.innerHTML = `
      <div class="place-card-icon">${meta.icon}</div>
      <div class="place-card-body">
        <h4></h4>
        <p></p>
      </div>
    `;
    card.querySelector('h4').textContent = name;
    card.querySelector('p').textContent = `${meta.label} · ${distance} away`;
    card.onclick = () => showDetailFromPlace(place, name, label, distance);
    listContainer.appendChild(card);
  });
}

// ---------- Detail panel ----------
function showDetailFromPlace(place, name, category, distance) {
  const t = place.tags || {};
  selectedPlaceData = {
    id: place.id,
    lat: place.lat,
    lon: place.lon,
    name,
    category,
    distance,
    tags: t
  };

  map.flyTo([place.lat, place.lon], 17, { duration: 1 });

  if (currentMarker) map.removeLayer(currentMarker);
  currentMarker = L.marker([place.lat, place.lon], { icon: acornIcon }).addTo(map).bindPopup(name).openPopup();

  renderDetailPanel();
}

function showDetailFromCoords(lat, lon, name, category) {
  const distance = null;
  selectedPlaceData = { id: null, lat, lon, name, category: category || 'Location', distance, tags: {} };
  renderDetailPanel();
}

function renderDetailPanel() {
  if (!selectedPlaceData) return;
  const p = selectedPlaceData;
  const t = p.tags || {};
  const meta = metaFor({ tags: t });
  const displayName = p.name || t.name || 'Unnamed Place';
  const category = meta.label;

  document.getElementById('detail-name').innerText = displayName;
  document.getElementById('detail-category').innerText = category;

  // Hero photo — try Wikimedia, fall back to the category emoji
  const photoEl = document.getElementById('detail-photo');
  photoEl.innerHTML = `<span>${meta.icon}</span>`;
  if (t.wikimedia_commons && /^File:/.test(t.wikimedia_commons)) {
    const file = t.wikimedia_commons.replace(/^File:/, '').replace(/ /g, '_');
    const src = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=200`;
    const img = new Image();
    img.onload = () => { photoEl.innerHTML = ''; img.style.cssText = 'width:100%;height:100%;object-fit:cover;'; photoEl.appendChild(img); };
    img.src = src;
  } else if (t.image) {
    const img = new Image();
    img.onload = () => { photoEl.innerHTML = ''; img.style.cssText = 'width:100%;height:100%;object-fit:cover;'; photoEl.appendChild(img); };
    img.src = t.image;
  }

  // Subtitle
  const distance = p.distance ? (p.distance > 1000 ? (p.distance / 1000).toFixed(1) + 'km' : p.distance.toFixed(0) + 'm') : '';
  const addrBits = [t['addr:housenumber'], t['addr:street'], t['addr:suburb'], t['addr:city'], t['addr:postcode']].filter(Boolean);
  const address = addrBits.join(' ');
  const infoParts = [category, distance ? distance + ' away' : '', address].filter(Boolean);
  document.getElementById('detail-info').innerText = infoParts.join(' · ');

  // Facts
  const facts = document.getElementById('detail-facts');
  const rows = [];
  const addRow = (icon, label, value, href) => {
    if (!value) return;
    const row = document.createElement('div');
    row.className = 'detail-fact';
    row.innerHTML = `
      <span class="fact-icon">${icon}</span>
      <span><span class="fact-label">${label}</span>${href ? `<a href="${href}" target="_blank" rel="noopener"></a>` : ''}</span>
    `;
    if (href) {
      const a = row.querySelector('a');
      a.textContent = value;
    } else {
      row.querySelector('span:last-child').appendChild(document.createTextNode(value));
    }
    facts.appendChild(row);
  };

  facts.innerHTML = '';
  addRow('📮', '', address);
  addRow('📞', '', t.phone || t['contact:phone']);
  addRow('🌐', '', t.website || t['contact:website'], t.website || t['contact:website']);
  addRow('🕒', '', t.opening_hours);
  addRow('🚇', '', t['railway'] ? CATEGORY_META.subway.label : (t['public_transport'] === 'station' ? 'Station' : ''));
  addRow('🌐', '', t.wikipedia ? 'Wikipedia' : '', t.wikipedia ? `https://en.wikipedia.org/wiki/${encodeURIComponent(t.wikipedia)}` : '');
  addRow('🧭', '', `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`);

  refreshSaveButton();

  // Nearby chips (only when we have OSM id and coords)
  const nearbyEl = document.getElementById('detail-nearby');
  const nearbyGrid = document.getElementById('detail-nearby-grid');
  nearbyGrid.innerHTML = '';
  if (p.lat && p.lon) {
    nearbyEl.style.display = '';
    // reuse the nearby mechanism to fetch related places once
    fetchNearbyCategories(p.lat, p.lon).then((groups) => {
      nearbyGrid.innerHTML = '';
      let any = false;
      for (const [cat, count] of Object.entries(groups)) {
        if (!count) continue;
        any = true;
        const chip = document.createElement('button');
        chip.className = 'detail-nearby-chip';
        chip.innerHTML = `${CATEGORY_META[cat] ? CATEGORY_META[cat].icon : '📍'} ${cat} <span class="muted">${count}</span>`;
        chip.onclick = () => {
          switchTab(null, 'home');
          map.flyTo([p.lat, p.lon], 16, { duration: 0.8 });
          // map cat to our 4 main categories
          const mainMap = { restaurant: 'restaurant', cafe: 'cafe', supermarket: 'supermarket' };
          const mainCat = mainMap[cat] || 'restaurant';
          findNearby(mainCat);
        };
        nearbyGrid.appendChild(chip);
      }
      if (!any) nearbyEl.style.display = 'none';
    });
  } else {
    nearbyEl.style.display = 'none';
  }

  document.getElementById('detail-panel').classList.add('open');
}

async function fetchNearbyCategories(lat, lon) {
  // one Overpass query for a small handful of categories
  const radius = 500;
  const q = `[out:json];(
    node[amenity=restaurant](around:${radius},${lat},${lon});
    node[amenity=cafe](around:${radius},${lat},${lon});
    node[shop=supermarket](around:${radius},${lat},${lon});
  );out tags 200;`;
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: q });
    if (!res.ok) return {};
    const data = await res.json();
    const counts = { restaurant: 0, cafe: 0, supermarket: 0 };
    (data.elements || []).forEach((el) => {
      const tg = el.tags || {};
      if (tg.amenity === 'restaurant') counts.restaurant++;
      else if (tg.amenity === 'cafe') counts.cafe++;
      else if (tg.shop === 'supermarket') counts.supermarket++;
    });
    // filter zeros out at render time
    return counts;
  } catch (e) {
    return {};
  }
}

function closeDetailPanel() {
  const panelEl = document.getElementById('detail-panel');
  if (panelEl) panelEl.classList.remove('open');
}

function routeToSelected() {
  if (!selectedPlaceData) return;
  switchTab(null, 'directions');
  const endInput = document.getElementById('end-input');
  if (endInput) endInput.value = selectedPlaceData.name;
  closeDetailPanel();
}

// ---------- Search ----------
const searchTimeouts = {};

async function searchLocations(query, resultContainerId) {
  const container = document.getElementById(resultContainerId);
  if (!container) return;

  if (!query || query.length < 2) {
    container.style.display = 'none';
    return;
  }

  container.innerHTML = '<div class="search-result-item">Searching...</div>';
  container.style.display = 'flex';

  clearTimeout(searchTimeouts[resultContainerId]);
  searchTimeouts[resultContainerId] = setTimeout(async () => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=6&addressdetails=1&q=${encodeURIComponent(query)}`,
        { headers: { 'Accept': 'application/json', 'User-Agent': 'DotoriMaps/1.0' } }
      );
      const data = await res.json();

      if (data && data.length > 0) {
        container.innerHTML = '';
        data.forEach((item) => {
          const row = document.createElement('div');
          row.className = 'search-result-item';
          const primary = (item.display_name || '').split(',')[0];
          const rest = (item.display_name || '').split(',').slice(1).join(',').trim();
          row.innerHTML = `<div></div>${rest ? `<small></small>` : ''}`;
          row.firstChild.textContent = primary;
          if (rest) row.querySelector('small').textContent = rest;
          row.addEventListener('click', () => {
            selectSearchResult(parseFloat(item.lat), parseFloat(item.lon), item.display_name, resultContainerId);
          });
          container.appendChild(row);
        });
      } else {
        container.innerHTML = '<div class="search-result-item">No results found</div>';
      }
    } catch (err) {
      container.innerHTML = '<div class="search-result-item">Error searching</div>';
    }
  }, 400);
}

function selectSearchResult(lat, lon, name, containerId) {
  const shortName = (name || '').split(',')[0];

  pushRecent(shortName);

  if (currentMarker) map.removeLayer(currentMarker);
  map.flyTo([lat, lon], 16);

  currentMarker = L.marker([lat, lon], { icon: acornIcon }).addTo(map).bindPopup(shortName).openPopup();

  const inputId = containerId.replace('-results', '-input');
  const inputEl = document.getElementById(inputId);
  const containerEl = document.getElementById(containerId);
  if (inputEl) inputEl.value = shortName;
  if (containerEl) containerEl.style.display = 'none';

  // Reverse geocode to enrich the panel
  reverseGeocodeAndShow(lat, lon, shortName);
}

async function reverseGeocodeAndShow(lat, lon, fallbackName) {
  // Optimistic first render, then enrich
  showDetailFromCoords(lat, lon, fallbackName, 'Location');
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
      { headers: { 'Accept': 'application/json', 'User-Agent': 'DotoriMaps/1.0' } }
    );
    const data = await res.json();
    if (data && data.display_name) {
      const name = (data.name && data.name !== '') ? data.name : (data.display_name || fallbackName).split(',')[0];
      const cat = data.category || data.type || 'Location';
      selectedPlaceData = {
        id: null,
        lat, lon,
        name,
        category: cat,
        distance: null,
        tags: data.address || {}
      };
      // Keep any address detail for the facts panel
      const addr = data.address || {};
      selectedPlaceData.tags = {
        ...addr,
        'addr:housenumber': addr.house_number,
        'addr:street': addr.road,
        'addr:suburb': addr.suburb || addr.neighbourhood,
        'addr:city': addr.city || addr.town || addr.village,
        'addr:postcode': addr.postcode,
        phone: data.extratags && data.extratags.phone,
        website: data.extratags && data.extratags.website,
        opening_hours: data.extratags && data.extratags.opening_hours
      };
      renderDetailPanel();
    }
  } catch (e) { /* leave optimistic render */ }
}

// Click anywhere on the map → reverse geocode
map.on('click', async (e) => {
  const { lat, lng } = e.latlng;
  if (currentMarker) map.removeLayer(currentMarker);
  currentMarker = L.marker([lat, lng], { icon: acornIcon }).addTo(map);
  await reverseGeocodeAndShow(lat, lng, 'Dropped pin');
});

// ---------- Routing ----------
async function getDirections() {
  const startInput = document.getElementById('start-input');
  const endInput = document.getElementById('end-input');
  if (!startInput || !endInput) return;

  const start = startInput.value.trim();
  const end = endInput.value.trim();
  if (!start || !end) { alert('Please enter both start and destination'); return; }

  const fetchCoords = async (q) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`
      );
      const data = await res.json();
      return data.length > 0 ? [parseFloat(data[0].lat), parseFloat(data[0].lon)] : null;
    } catch (e) { return null; }
  };

  const [startCoords, endCoords] = await Promise.all([fetchCoords(start), fetchCoords(end)]);
  if (!startCoords || !endCoords) { alert('Could not find one of the locations.'); return; }

  if (routingControl) {
    try { map.removeControl(routingControl); } catch (e) {}
    routingControl = null;
  }
  if (currentMarker) { map.removeLayer(currentMarker); currentMarker = null; }

  routingControl = L.Routing.control({
    waypoints: [L.latLng(...startCoords), L.latLng(...endCoords)],
    router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
    lineOptions: { styles: [{ color: '#FF9EC4', weight: 5, opacity: 0.8 }] },
    createMarker: function (i, wp) { return L.marker(wp.latLng, { icon: acornIcon }); }
  }).addTo(map);
}

// ---------- Saved places drawer ----------
function openSavedDrawer() {
  const list = getSaved();
  const listEl = document.getElementById('saved-list');
  if (!listEl) return;

  if (list.length === 0) {
    listEl.innerHTML = '<p style="font-size: 12px; color: #888; text-align: center; padding: 20px;">No saved places yet.<br><span style="color:#BBB; font-size:11px;">Tap 🔖 Save on any place card.</span></p>';
  } else {
    listEl.innerHTML = '';
    list.forEach((place, i) => {
      const row = document.createElement('div');
      row.className = 'place-card';
      row.innerHTML = `
        <div class="place-card-icon">🌰</div>
        <div class="place-card-body">
          <h4></h4>
          <p></p>
        </div>
      `;
      row.querySelector('h4').textContent = place.name || 'Saved place';
      row.querySelector('p').textContent = `${place.lat.toFixed(4)}, ${place.lon.toFixed(4)}`;
      row.onclick = () => {
        if (currentMarker) map.removeLayer(currentMarker);
        map.flyTo([place.lat, place.lon], 17);
        currentMarker = L.marker([place.lat, place.lon], { icon: acornIcon }).addTo(map).bindPopup(place.name || 'Saved place').openPopup();
        reverseGeocodeAndShow(place.lat, place.lon, place.name);
        switchTab(null, 'home');
      };
      listEl.appendChild(row);
    });
  }

  // Switch to the saved tab (we reuse the home tab visually by injecting content)
  switchTab(null, 'home');
  document.getElementById('tab-home').innerHTML = `
    <div class="recommendation-title">🔖 Saved places</div>
    <div id="saved-list"></div>
    <button class="dotori-btn" style="margin-top:12px;" onclick="restoreHomeTab()">Back to explore</button>
  `;

  // Re-render the list (the innerHTML above wiped it)
  const freshList = document.getElementById('saved-list');
  if (list.length === 0) {
    freshList.innerHTML = '<p style="font-size: 12px; color: #888; text-align: center; padding: 20px;">No saved places yet.</p>';
  } else {
    list.forEach((place) => {
      const row = document.createElement('div');
      row.className = 'place-card';
      row.innerHTML = `<div class="place-card-icon">🌰</div><div class="place-card-body"><h4></h4><p></p></div>`;
      row.querySelector('h4').textContent = place.name || 'Saved place';
      row.querySelector('p').textContent = `${place.lat.toFixed(4)}, ${place.lon.toFixed(4)}`;
      row.onclick = () => {
        if (currentMarker) map.removeLayer(currentMarker);
        map.flyTo([place.lat, place.lon], 17);
        currentMarker = L.marker([place.lat, place.lon], { icon: acornIcon }).addTo(map).bindPopup(place.name || 'Saved place').openPopup();
        reverseGeocodeAndShow(place.lat, place.lon, place.name);
      };
      freshList.appendChild(row);
    });
  }
}

function restoreHomeTab() {
  const home = document.getElementById('tab-home');
  if (!home) return;
  home.innerHTML = `
    <div class="category-grid">
      <div class="cat-btn" onclick="findNearby('restaurant')"><i class="fa-solid fa-utensils"></i><span>Food</span></div>
      <div class="cat-btn" onclick="findNearby('cafe')"><i class="fa-solid fa-mug-hot"></i><span>Cafe</span></div>
      <div class="cat-btn" onclick="findNearby('transit_station')"><i class="fa-solid fa-train-subway"></i><span>Transit</span></div>
      <div class="cat-btn" onclick="findNearby('supermarket')"><i class="fa-solid fa-bag-shopping"></i><span>Shopping</span></div>
    </div>
    <div class="recommendation-title" id="nearby-title">🌰 Discover Nearby</div>
    <div id="nearby-list">
      <p style="font-size: 11px; color: #888; text-align: center; padding: 20px;">Select a category above to explore.</p>
    </div>
  `;
}

// ---------- Auth ----------
async function initAuthUI() {
  try {
    const profile = await DotoriStorage.getMyAcorn();
    if (profile) updateMapLoginButton(profile);
  } catch (e) {}
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuthUI);
} else {
  initAuthUI();
}

function updateMapLoginButton(profile) {
  const btn = document.getElementById('map-login-btn');
  if (!btn) return;
  if (profile) { btn.innerText = profile.mini_me || '🌰'; btn.style.background = '#FFF8F0'; }
  else { btn.innerText = '👤'; btn.style.background = '#FFF'; }
}

async function openMapLogin() {
  const savedId = localStorage.getItem('dotori_my_id');
  if (savedId) {
    if (confirm(`Logged in as ${savedId}. Log out?`)) {
      try {
        await DotoriStorage.logout();
        updateMapLoginButton(null);
        showBubble('Logged out.');
      } catch (e) { showBubble('Logout failed.'); }
    }
    return;
  }
  const id = prompt('Enter your Dotori ID (e.g. dotori-t7vl):');
  if (!id || !id.trim()) return;
  try {
    const profile = await DotoriStorage.loginByDotoriId(id.trim());
    if (profile) { updateMapLoginButton(profile); showBubble(`Welcome, ${profile.nickname}!`); }
    else { showBubble('ID not found.'); }
  } catch (err) { showBubble('Login failed: ' + (err.message || '')); }
}

// ---------- Toast ----------
function showBubble(text) {
  const el = document.createElement('div');
  el.textContent = text;
  Object.assign(el.style, {
    position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
    background: '#8B5E2E', color: '#fff', padding: '10px 18px',
    borderRadius: '20px', fontSize: '12px', zIndex: 9999,
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)', opacity: '0', transition: 'opacity 0.25s'
  });
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; });
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2600);
}

// ---------- Keyboard shortcuts ----------
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeDetailPanel();
    document.querySelectorAll('.search-results-list').forEach((el) => el.style.display = 'none');
  }
  if (e.key === '/' && document.activeElement && document.activeElement.tagName !== 'INPUT') {
    e.preventDefault();
    const inp = document.getElementById('search-input');
    if (inp) { inp.focus(); switchTab(null, 'search'); }
  }
});

// ---------- Toolbox wiring ----------
document.getElementById('map-login-btn')?.addEventListener('click', openMapLogin);
document.getElementById('locate-btn')?.addEventListener('click', findMyLocation);
document.getElementById('saved-btn')?.addEventListener('click', openSavedDrawer);
document.getElementById('zoom-in')?.addEventListener('click', () => map.zoomIn());
document.getElementById('zoom-out')?.addEventListener('click', () => map.zoomOut());

// Initialize recent searches
renderRecent();