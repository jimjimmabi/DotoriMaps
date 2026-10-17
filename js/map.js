// ============================================
// DotoriMaps - Complete Logic
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

// 1. Tab Switching
function switchTab(event, tabName) {
  document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  if (event && event.currentTarget) {
    event.currentTarget.classList.add('active');
  } else {
    const labels = { home: 'Home', search: 'Search', directions: 'Routes' };
    const label = labels[tabName];
    document.querySelectorAll('.sidebar-tab').forEach((t) => {
      if (label && t.textContent.trim().includes(label)) t.classList.add('active');
    });
  }

  const target = document.getElementById(`tab-${tabName}`);
  if (target) target.classList.add('active');

  closeDetailPanel();
}

// 2. Find My Location
function findMyLocation() {
  if (!navigator.geolocation) {
    alert('Geolocation not supported');
    return;
  }
  const btn = document.getElementById('locate-btn');
  if (btn) btn.innerText = '⏳';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      map.flyTo([pos.coords.latitude, pos.coords.longitude], 16, { duration: 1.5 });
      if (currentMarker) map.removeLayer(currentMarker);
      currentMarker = L.marker([pos.coords.latitude, pos.coords.longitude], { icon: acornIcon })
        .addTo(map)
        .bindPopup('📍 You are here')
        .openPopup();
      if (btn) btn.innerText = '📍';
    },
    () => {
      alert('Could not get location.');
      if (btn) btn.innerText = '📍';
    },
    { enableHighAccuracy: true }
  );
}

// 3. Find Nearby (Overpass API with Fallbacks)
let nearbyRequestId = 0;

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
  for (let url of endpoints) {
    try {
      const res = await fetch(url, { method: 'POST', body: query });
      if (!res.ok) continue;
      data = await res.json();
      if (data && data.elements) break;
    } catch (e) {
      console.warn(`Failed fetching from ${url}`);
    }
  }

  if (requestId !== nearbyRequestId) return; // superseded by a newer request

  if (data && data.elements && data.elements.length > 0) {
    listContainer.innerHTML = '';

    const places = data.elements.map((place) => {
      place.distance = map.distance([lat, lng], [place.lat, place.lon]);
      return place;
    }).sort((a, b) => a.distance - b.distance);

    places.forEach((place) => {
      const name = (place.tags && place.tags.name) || 'Unnamed Place';
      const distance = place.distance > 1000
        ? (place.distance / 1000).toFixed(1) + 'km'
        : place.distance.toFixed(0) + 'm';

      const card = document.createElement('div');
      card.className = 'place-card';
      card.innerHTML = `<h4></h4><p></p>`;
      card.querySelector('h4').textContent = name;
      card.querySelector('p').textContent = `${label} · ${distance} away`;
      card.onclick = () => showDetailPanel(place, name, label, distance);
      listContainer.appendChild(card);
    });
  } else {
    listContainer.innerHTML = '<p style="font-size: 11px; color: #888; text-align: center; padding: 20px;">No places found nearby.</p>';
  }
}

// 4. Detail Panel
function showDetailPanel(place, name, category, distance) {
  selectedPlaceData = { lat: place.lat, lon: place.lon, name: name };

  map.flyTo([place.lat, place.lon], 17, { duration: 1 });

  if (currentMarker) map.removeLayer(currentMarker);
  currentMarker = L.marker([place.lat, place.lon], { icon: acornIcon })
    .addTo(map)
    .bindPopup(name)
    .openPopup();

  const nameEl = document.getElementById('detail-name');
  const infoEl = document.getElementById('detail-info');
  const panelEl = document.getElementById('detail-panel');

  if (nameEl) nameEl.innerText = name;
  if (infoEl) infoEl.innerText = `${category}${distance ? ' · ' + distance + ' away' : ''}`;
  if (panelEl) panelEl.classList.add('open');
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

// 5. Fast Search (per-container debounce)
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
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`,
        { headers: { 'Accept': 'application/json', 'User-Agent': 'DotoriMaps/1.0' } }
      );
      const data = await res.json();

      if (data && data.length > 0) {
        container.innerHTML = '';
        data.forEach((item) => {
          const row = document.createElement('div');
          row.className = 'search-result-item';
          row.textContent = item.display_name;
          row.addEventListener('click', () => {
            selectSearchResult(
              parseFloat(item.lat),
              parseFloat(item.lon),
              item.display_name,
              resultContainerId
            );
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
  if (currentMarker) map.removeLayer(currentMarker);
  map.flyTo([lat, lon], 16);

  currentMarker = L.marker([lat, lon], { icon: acornIcon })
    .addTo(map)
    .bindPopup(name)
    .openPopup();

  const inputId = containerId.replace('-results', '-input');
  const inputEl = document.getElementById(inputId);
  const containerEl = document.getElementById(containerId);
  const shortName = (name || '').split(',')[0];

  if (inputEl) inputEl.value = shortName;
  if (containerEl) containerEl.style.display = 'none';

  showDetailPanel({ lat, lon }, shortName, 'Location', '');
}

// 6. Routing
let routingControl = null;

async function getDirections() {
  const startInput = document.getElementById('start-input');
  const endInput = document.getElementById('end-input');
  if (!startInput || !endInput) return;

  const start = startInput.value.trim();
  const end = endInput.value.trim();
  if (!start || !end) {
    alert('Please enter both start and destination');
    return;
  }

  const fetchCoords = async (q) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`
      );
      const data = await res.json();
      return data.length > 0 ? [parseFloat(data[0].lat), parseFloat(data[0].lon)] : null;
    } catch (e) {
      return null;
    }
  };

  const [startCoords, endCoords] = await Promise.all([fetchCoords(start), fetchCoords(end)]);

  if (!startCoords || !endCoords) {
    alert('Could not find one of the locations.');
    return;
  }

  if (routingControl) {
    try { map.removeControl(routingControl); } catch (e) {}
    routingControl = null;
  }

  if (currentMarker) { map.removeLayer(currentMarker); currentMarker = null; }

  routingControl = L.Routing.control({
    waypoints: [L.latLng(...startCoords), L.latLng(...endCoords)],
    router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
    lineOptions: { styles: [{ color: '#FF9EC4', weight: 5, opacity: 0.8 }] },
    createMarker: function (i, wp) {
      return L.marker(wp.latLng, { icon: acornIcon });
    }
  }).addTo(map);
}

// 7. Auth UI
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
  if (profile) {
    btn.innerText = profile.mini_me || '🌰';
    btn.style.background = '#FFF8F0';
  } else {
    btn.innerText = '👤';
    btn.style.background = '#FFF';
  }
}

async function openMapLogin() {
  const savedId = localStorage.getItem('dotori_my_id');

  if (savedId) {
    if (confirm(`Logged in as ${savedId}. Log out?`)) {
      try {
        await DotoriStorage.logout();
        updateMapLoginButton(null);
        showBubble('Logged out.');
      } catch (e) {
        showBubble('Logout failed.');
      }
    }
    return;
  }

  const id = prompt('Enter your Dotori ID (e.g. dotori-t7vl):');
  if (!id || !id.trim()) return;

  try {
    const profile = await DotoriStorage.loginByDotoriId(id.trim());
    if (profile) {
      updateMapLoginButton(profile);
      showBubble(`Welcome, ${profile.nickname}!`);
    } else {
      showBubble('ID not found.');
    }
  } catch (err) {
    showBubble('Login failed: ' + (err.message || ''));
  }
}

// Tiny non-blocking toast
function showBubble(text) {
  const el = document.createElement('div');
  el.textContent = text;
  Object.assign(el.style, {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#8B5E2E',
    color: '#fff',
    padding: '10px 18px',
    borderRadius: '20px',
    fontSize: '12px',
    zIndex: 9999,
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
    opacity: '0',
    transition: 'opacity 0.25s'
  });
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; });
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 2600);
}

// ---------- Toolbox wiring ----------
document.getElementById('map-login-btn')?.addEventListener('click', openMapLogin);
document.getElementById('locate-btn')?.addEventListener('click', findMyLocation);
document.getElementById('zoom-in')?.addEventListener('click', () => map.zoomIn());
document.getElementById('zoom-out')?.addEventListener('click', () => map.zoomOut());