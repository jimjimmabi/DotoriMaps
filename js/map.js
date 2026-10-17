// ============================================
// DotoriMaps - Complete Logic
// ============================================

const map = L.map('map', { zoomControl: false, rotate: false }).setView([37.5665, 126.9780], 13);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);

const acornIcon = L.divIcon({ className: 'acorn-marker', html: '<div></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
let currentMarker = null;
let selectedPlaceData = null;

// 1. Tab Switching
function switchTab(event, tabName) {
  document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  if (event && event.currentTarget) event.currentTarget.classList.add('active');
  document.getElementById(`tab-${tabName}`).classList.add('active');
  closeDetailPanel();
}

// 2. Find My Location
function findMyLocation() {
  if (!navigator.geolocation) return alert('Geolocation not supported');
  const btn = document.getElementById('locate-btn');
  btn.innerText = '⏳';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      map.flyTo([pos.coords.latitude, pos.coords.longitude], 16, { duration: 1.5 });
      if (currentMarker) map.removeLayer(currentMarker);
      currentMarker = L.marker([pos.coords.latitude, pos.coords.longitude], { icon: acornIcon }).addTo(map).bindPopup('📍 You are here').openPopup();
      btn.innerText = '📍';
    },
    (err) => { alert('Could not get location.'); btn.innerText = '📍'; },
    { enableHighAccuracy: true }
  );
}

// 3. Find Nearby (Overpass API with Fallbacks)
async function findNearby(category) {
  const listContainer = document.getElementById('nearby-list');
  const title = document.getElementById('nearby-title');
  
  listContainer.innerHTML = '<div class="spinner"></div>';
  
  const center = map.getCenter();
  const lat = center.lat;
  const lng = center.lng;
  const radius = 2000; // 2km radius

  let osmTag = '', label = '';
  if (category === 'restaurant') { osmTag = 'amenity=restaurant'; label = 'Restaurants'; }
  else if (category === 'cafe') { osmTag = 'amenity=cafe'; label = 'Cafes'; }
  else if (category === 'transit_station') { osmTag = 'public_transport=station'; label = 'Transit'; }
  else if (category === 'supermarket') { osmTag = 'shop=supermarket'; label = 'Shopping'; }

  title.innerText = `🌰 Nearby ${label}`;

  const query = `[out:json];node[${osmTag}](around:${radius},${lat},${lng});out body 20;`;
  
  // We try two different Overpass servers to ensure it doesn't fail
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
    } catch (e) { console.warn(`Failed fetching from ${url}`); }
  }
  
  if (data && data.elements && data.elements.length > 0) {
    listContainer.innerHTML = '';
    // Sort by distance
    const places = data.elements.map(place => {
      place.distance = map.distance([lat, lng], [place.lat, place.lon]);
      return place;
    }).sort((a, b) => a.distance - b.distance);

    places.forEach(place => {
      const name = place.tags.name || 'Unnamed Place';
      const distance = place.distance > 1000 ? (place.distance/1000).toFixed(1) + 'km' : place.distance.toFixed(0) + 'm';
      
      const card = document.createElement('div');
      card.className = 'place-card';
      card.innerHTML = `<h4>${name}</h4><p>${label} · ${distance} away</p>`;
      card.onclick = () => showDetailPanel(place, name, label, distance);
      listContainer.appendChild(card);
    });
  } else {
    listContainer.innerHTML = '<p style="font-size: 11px; color: #888; text-align: center; padding: 20px;">No places found nearby.</p>';
  }
}

// 4. Detail Panel Logic
function showDetailPanel(place, name, category, distance) {
  selectedPlaceData = { lat: place.lat, lon: place.lon, name: name };
  
  // Fly to map
  map.flyTo([place.lat, place.lon], 17, { duration: 1 });
  
  // Drop Pin
  if (currentMarker) map.removeLayer(currentMarker);
  currentMarker = L.marker([place.lat, place.lon], { icon: acornIcon }).addTo(map).bindPopup(name).openPopup();

  // Fill panel
  document.getElementById('detail-name').innerText = name;
  document.getElementById('detail-info').innerText = `${category} · ${distance} away`;
  
  // Open panel
  document.getElementById('detail-panel').classList.add('open');
}

function closeDetailPanel() {
  document.getElementById('detail-panel').classList.remove('open');
}

function routeToSelected() {
  if (!selectedPlaceData) return;
  switchTab(null, 'directions');
  document.getElementById('end-input').value = selectedPlaceData.name;
  // Optionally auto-fill start with user location if we have it
  closeDetailPanel();
}

// 5. Fast Search (Debounced)
let searchTimeout;
async function searchLocations(query, resultContainerId) {
  const container = document.getElementById(resultContainerId);
  if (!query || query.length < 2) { container.style.display = 'none'; return; }
  
  container.innerHTML = '<div class="search-result-item">Searching...</div>';
  container.style.display = 'flex';
  
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'DotoriMaps/1.0' }
      });
      const data = await res.json();
      
      if (data && data.length > 0) {
        container.innerHTML = data.map(item => `
          <div class="search-result-item" onclick="selectSearchResult(${item.lat}, ${item.lon}, '${item.display_name.replace(/'/g, "\\'")}', '${resultContainerId}')">
            ${item.display_name}
          </div>
        `).join('');
      } else {
        container.innerHTML = '<div class="search-result-item">No results found</div>';
      }
    } catch (err) {
      container.innerHTML = '<div class="search-result-item">Error searching</div>';
    }
  }, 400); // 400ms debounce (faster than 600ms)
}

function selectSearchResult(lat, lon, name, containerId) {
  map.flyTo([lat, lon], 16);
  
  if (currentMarker) map.removeLayer(currentMarker);
  currentMarker = L.marker([lat, lon], { icon: acornIcon }).addTo(map).bindPopup(name).openPopup();
  
  const inputId = containerId.replace('-results', '-input');
  document.getElementById(inputId).value = name.split(',')[0];
  document.getElementById(containerId).style.display = 'none';
  
  // Show detail panel for searched result
  showDetailPanel({ lat, lon }, name.split(',')[0], 'Location', '');
}

// 6. Routing
async function getDirections() {
  const start = document.getElementById('start-input').value;
  const end = document.getElementById('end-input').value;
  if (!start || !end) return alert('Please enter both start and destination');

  const fetchCoords = async (q) => {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`);
    const data = await res.json();
    return data.length > 0 ? [parseFloat(data[0].lat), parseFloat(data[0].lon)] : null;
  };

  const startCoords = await fetchCoords(start);
  const endCoords = await fetchCoords(end);

  if (startCoords && endCoords) {
    L.Routing.control({
      waypoints: [L.latLng(...startCoords), L.latLng(...endCoords)],
      router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
      lineOptions: { styles: [{ color: '#FF9EC4', weight: 5, opacity: 0.8 }] },
      createMarker: function(i, wp) { return L.marker(wp.latLng, { icon: acornIcon }); }
    }).addTo(map);
  } else {
    alert('Could not find one of the locations.');
  }
}

// 7. Auth (Unchanged)
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const profile = await DotoriStorage.getMyAcorn();
    if (profile) updateMapLoginButton(profile);
  } catch (e) {}
});

function updateMapLoginButton(profile) {
  const btn = document.getElementById('map-login-btn');
  if (profile) { btn.innerText = profile.mini_me || '🌰'; btn.style.background = '#FFF8F0'; }
  else { btn.innerText = '👤'; btn.style.background = '#FFF'; }
}

function openMapLogin() {
  const savedId = localStorage.getItem('dotori_my_id');
  if (savedId) {
    if (confirm(`Logged in as ${savedId}. Log out?`)) {
      DotoriStorage.logout().then(() => { updateMapLoginButton(null); alert('Logged out.'); });
    }
    return;
  }
  const id = prompt("Enter your Dotori ID:");
  if (!id) return;
  DotoriStorage.loginByDotoriId(id).then(profile => {
    if (profile) { updateMapLoginButton(profile); alert(`Welcome, ${profile.nickname}!`); }
    else { alert('ID not found.'); }
  }).catch(err => alert('Login failed: ' + err.message));
}