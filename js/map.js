// ============================================
// DotoriMaps - Map & Auth Logic
// ============================================

// 1. Init Map (Center on Seoul)
const map = L.map('map').setView([37.5665, 126.9780], 13);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);

const acornIcon = L.divIcon({ className: 'acorn-marker', html: '<div></div>', iconSize: [18, 18], iconAnchor: [9, 9] });

const routingControl = L.Routing.control({
  waypoints: [],
  router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
  lineOptions: { styles: [{ color: '#FF9EC4', weight: 5, opacity: 0.8 }] },
  createMarker: function(i, wp, nWps) { return L.marker(wp.latLng, { icon: acornIcon }); }
}).addTo(map);

// 2. Tab Switching Logic
function switchTab(tabName) {
  document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  
  // Find the clicked tab and activate it
  event.currentTarget.classList.add('active');
  document.getElementById(`tab-${tabName}`).classList.add('active');
}

// 3. Search Logic
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
  map.setView([lat, lon], 16);
  L.marker([lat, lon], { icon: acornIcon }).addTo(map).bindPopup(name).openPopup();
  
  const inputId = containerId.replace('-results', '-input');
  document.getElementById(inputId).value = name.split(',')[0];
  document.getElementById(containerId).style.display = 'none';
}

// 4. Directions Logic
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
    routingControl.setWaypoints([L.latLng(...startCoords), L.latLng(...endCoords)]);
  } else {
    alert('Could not find one of the locations.');
  }
}

// 5. Authentication Logic
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