// ============================================
// DotoriMaps - Map & Auth Logic
// ============================================

// 1. Init Map (Center on Seoul)
const map = L.map('map', { 
  zoomControl: false, // We use our own custom buttons
  rotate: false       // Keeps the map North-Up
}).setView([37.5665, 126.9780], 13);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { 
  maxZoom: 19, 
  attribution: '&copy; OpenStreetMap contributors' 
}).addTo(map);

const acornIcon = L.divIcon({ className: 'acorn-marker', html: '<div></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
let userLocationMarker = null;
let userAccuracyCircle = null;

// 2. Tab Switching
function switchTab(event, tabName) {
  document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  if (event && event.currentTarget) event.currentTarget.classList.add('active');
  const targetTab = document.getElementById(`tab-${tabName}`);
  if (targetTab) targetTab.classList.add('active');
}

// 3. Find My Location (Geolocation)
function findMyLocation() {
  if (!navigator.geolocation) {
    return alert('이 브라우저는 위치 기능을 지원하지 않습니다.');
  }
  
  const btn = document.getElementById('locate-btn');
  btn.innerText = '⏳';

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = position.coords.accuracy;

      // Center map on user
      map.flyTo([lat, lng], 16, { duration: 1.5 });

      // Remove old markers if they exist
      if (userLocationMarker) map.removeLayer(userLocationMarker);
      if (userAccuracyCircle) map.removeLayer(userAccuracyCircle);

      // Add accuracy circle (shows margin of error)
      userAccuracyCircle = L.circle([lat, lng], {
        radius: accuracy,
        color: '#FF9EC4',
        fillColor: '#FF9EC4',
        fillOpacity: 0.15,
        weight: 1
      }).addTo(map);

      // Add user marker
      userLocationMarker = L.marker([lat, lng], { icon: acornIcon })
        .addTo(map)
        .bindPopup('📍 내 위치 (You are here)')
        .openPopup();

      btn.innerText = '📍';
    },
    (err) => {
      alert('위치를 가져올 수 없습니다. 권한을 확인해주세요.');
      btn.innerText = '📍';
    },
    { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
  );
}

// 4. Find Nearby Places (Overpass API)
async function findNearby(category) {
  const listContainer = document.getElementById('nearby-list');
  const title = document.getElementById('nearby-title');
  
  listContainer.innerHTML = '<p style="font-size: 11px; color: #888; text-align: center; padding: 20px;">Searching...</p>';
  
  // Get map center
  const center = map.getCenter();
  const lat = center.lat;
  const lng = center.lng;
  const radius = 1500; // Search within 1.5km

  // Map our categories to OSM tags
  let osmTag = '';
  let label = '';
  if (category === 'restaurant') { osmTag = 'amenity=restaurant'; label = 'Restaurants'; }
  else if (category === 'cafe') { osmTag = 'amenity=cafe'; label = 'Cafes'; }
  else if (category === 'transit_station') { osmTag = 'public_transport=station'; label = 'Transit Stations'; }
  else if (category === 'supermarket') { osmTag = 'shop=supermarket'; label = 'Supermarkets'; }

  title.innerText = `🌰 Nearby ${label}`;

  // Overpass API Query
  const query = `
    [out:json];
    node[${osmTag}](around:${radius},${lat},${lng});
    out body 15;
  `;
  
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query
    });
    const data = await res.json();
    
    if (data.elements && data.elements.length > 0) {
      listContainer.innerHTML = ''; // Clear loading
      
      data.elements.forEach(place => {
        const name = place.tags.name || 'Unnamed Place';
        const distance = map.distance([lat, lng], [place.lat, place.lon]).toFixed(0);
        
        // Create card
        const card = document.createElement('div');
        card.className = 'place-card';
        card.innerHTML = `
          <h4>${name}</h4>
          <p>${label} · ${distance}m away</p>
        `;
        card.onclick = () => {
          map.flyTo([place.lat, place.lon], 17);
          L.marker([place.lat, place.lon], { icon: acornIcon }).addTo(map).bindPopup(name).openPopup();
        };
        listContainer.appendChild(card);
      });
    } else {
      listContainer.innerHTML = '<p style="font-size: 11px; color: #888; text-align: center; padding: 20px;">No places found nearby.</p>';
    }
  } catch (err) {
    console.error(err);
    listContainer.innerHTML = '<p style="font-size: 11px; color: #888; text-align: center; padding: 20px;">Error loading places.</p>';
  }
}

// 5. Standard Search Logic
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
          <div class="search-result-item" onclick="selectLocation(${item.lat}, ${item.lon}, '${item.display_name.replace(/'/g, "\\'")}', '${resultContainerId}')">
            ${item.display_name}
          </div>
        `).join('');
      } else {
        container.innerHTML = '<div class="search-result-item">No results found</div>';
      }
    } catch (err) {
      container.innerHTML = '<div class="search-result-item">Error searching</div>';
    }
  }, 600);
}

function selectLocation(lat, lon, name, containerId) {
  map.flyTo([lat, lon], 16);
  L.marker([lat, lon], { icon: acornIcon }).addTo(map).bindPopup(name).openPopup();
  
  const inputId = containerId.replace('-results', '-input');
  document.getElementById(inputId).value = name.split(',')[0];
  document.getElementById(containerId).style.display = 'none';
}

// 6. Directions Logic
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
    const routingControl = L.Routing.control({
      waypoints: [L.latLng(...startCoords), L.latLng(...endCoords)],
      router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
      lineOptions: { styles: [{ color: '#FF9EC4', weight: 5, opacity: 0.8 }] },
      createMarker: function(i, wp) { return L.marker(wp.latLng, { icon: acornIcon }); }
    }).addTo(map);
  } else {
    alert('Could not find one of the locations.');
  }
}

// 7. Authentication Logic (Same as before)
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const profile = await DotoriStorage.getMyAcorn();
    if (profile) updateMapLoginButton(profile);
  } catch (e) {}
});

function updateMapLoginButton(profile) {
  const btn = document.getElementById('map-login-btn');
  if (profile) {
    btn.innerText = profile.mini_me || '🌰';
    btn.title = `Logged in as ${profile.nickname}`;
    btn.style.background = '#FFF8F0'; 
  } else {
    btn.innerText = '👤';
    btn.title = 'Login';
    btn.style.background = '#FFF';
  }
}

function openMapLogin() {
  const savedId = localStorage.getItem('dotori_my_id');
  if (savedId) {
    if (confirm(`Logged in as ${savedId}. Do you want to log out?`)) {
      DotoriStorage.logout().then(() => {
        updateMapLoginButton(null);
        alert('Logged out.');
      });
    }
    return;
  }

  const id = prompt("Enter your Dotori ID (e.g., dotori-xxxx):");
  if (!id) return;

  DotoriStorage.loginByDotoriId(id).then(profile => {
    if (profile) {
      updateMapLoginButton(profile);
      alert(`Welcome back, ${profile.nickname}!`);
    } else {
      alert('ID not found. Please check your spelling.');
    }
  }).catch(err => {
    alert('Login failed: ' + err.message);
  });
}