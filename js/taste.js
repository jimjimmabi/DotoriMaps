// ============================================
// 도토리숲 — 취향 찾기 (Taste Finder)
// ============================================
let tasteAllProfiles = [];
let tasteMyProfile = null;
let tasteSearchTerm = '';
let tasteBirthdayTerm = '';
let tasteActiveFilter = 'all';

async function initTasteTab() {
  const container = document.getElementById('tab-taste');
  if (!container) return;
  container.innerHTML = `
    <div class="taste-page">
      <div class="taste-header">
        <h2>🌱 취향 찾기</h2>
        <p class="taste-purpose">
          도토리숲은 광고도, 알고리즘도, 팔로워 수도 없습니다.<br>
          그냥, 당신과 비슷한 사람들을 찾는 작은 숲입니다.
        </p>
      </div>
      <div class="taste-search">
        <input type="text" id="taste-search-input" placeholder="닉네임이나 취향으로 검색해보세요" class="editor-input" autocomplete="off">
      </div>

      <!-- Birthday Dropdowns -->
      <div class="taste-search" style="margin-top:8px;">
        <div class="birthday-filter-row">
          <span class="birthday-filter-label">🎂 생일</span>
          <select id="taste-birthday-month" class="editor-input birthday-filter-select">
            <option value="">월</option>
            ${Array.from({length: 12}, (_, i) => i + 1).map((m) => {
              const monthStr = String(m).padStart(2, '0');
              return `<option value="${monthStr}">${m}월</option>`;
            }).join('')}
          </select>
          <select id="taste-birthday-day" class="editor-input birthday-filter-select">
            <option value="">일</option>
            ${Array.from({length: 31}, (_, i) => i + 1).map((d) => {
              const dayStr = String(d).padStart(2, '0');
              return `<option value="${dayStr}">${d}일</option>`;
            }).join('')}
          </select>
        </div>
      </div>

      <div class="taste-filters">
        <button class="filter-chip active" data-filter="all">전체</button>
        <button class="filter-chip" data-filter="interests">관심사</button>
        <button class="filter-chip" data-filter="music">음악</button>
        <button class="filter-chip" data-filter="mood">감성</button>
      </div>
      <div id="taste-list" class="taste-list">
        <p class="empty-message">불러오는 중...</p>
      </div>
    </div>
  `;

  const searchInput = document.getElementById('taste-search-input');
  if (searchInput) {
    searchInput.value = tasteSearchTerm;
    searchInput.addEventListener('input', (e) => {
      tasteSearchTerm = e.target.value.trim().toLowerCase();
      renderTasteList();
    });
  }

  const bMonthSel = document.getElementById('taste-birthday-month');
  const bDaySel = document.getElementById('taste-birthday-day');

  if (bMonthSel && tasteBirthdayTerm) {
    bMonthSel.value = tasteBirthdayTerm.split('-')[0] || '';
  }
  if (bDaySel && tasteBirthdayTerm && tasteBirthdayTerm.length === 5) {
    bDaySel.value = tasteBirthdayTerm.split('-')[1] || '';
  }

  const updateBirthdayFilter = () => {
    const m = bMonthSel ? bMonthSel.value : '';
    const d = bDaySel ? bDaySel.value : '';
    
    if (!m) {
      tasteBirthdayTerm = '';
    } else if (!d) {
      tasteBirthdayTerm = m;
    } else {
      tasteBirthdayTerm = `${m}-${d}`;
    }
    renderTasteList();
  };

  if (bMonthSel) bMonthSel.addEventListener('change', updateBirthdayFilter);
  if (bDaySel) bDaySel.addEventListener('change', updateBirthdayFilter);

  container.querySelectorAll('.filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      container.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      tasteActiveFilter = chip.dataset.filter;
      renderTasteList();
    });
  });

  await loadTasteData();
}

async function loadTasteData() {
  try {
    tasteMyProfile = await DotoriStorage.getMyAcorn();
    const all = await DotoriStorage.getAllProfiles();

    tasteAllProfiles = (all || []).filter((p) => {
      return !tasteMyProfile || p.dotori_id !== tasteMyProfile.dotori_id;
    });

    const myTastes = (tasteMyProfile && tasteMyProfile.tastes) || {};
    const myBirthday = (tasteMyProfile && tasteMyProfile.birthday) || null;

    tasteAllProfiles = tasteAllProfiles.map((p) => {
      const result = DotoriStorage.calculateMatch(myTastes, p.tastes || {}, myBirthday, p.birthday || null);
      return { ...p, matchScore: result.score, matchReasons: result.reasons };
    });

    tasteAllProfiles.sort((a, b) => b.matchScore - a.matchScore);
    renderTasteList();
  } catch (err) {
    console.error('Taste load failed:', err);
    const list = document.getElementById('taste-list');
    if (list) list.innerHTML = '<p class="empty-message">숲을 불러올 수 없어요.</p>';
  }
}

function renderTasteList() {
  const list = document.getElementById('taste-list');
  if (!list) return;
  let filtered = tasteAllProfiles;

  if (tasteSearchTerm) {
    filtered = filtered.filter((p) => {
      const nickname = (p.nickname || '').toLowerCase();
      const status = (p.status_message || '').toLowerCase();
      const t = p.tastes || {};
      const interests = (t.interests || []).join(' ').toLowerCase();
      const music = (t.music || []).join(' ').toLowerCase();
      const mood = (t.mood || []).join(' ').toLowerCase();
      const favorites = (t.favorites || '').toLowerCase();
      const needs = (t.needs || '').toLowerCase();

      return nickname.includes(tasteSearchTerm) || status.includes(tasteSearchTerm) || interests.includes(tasteSearchTerm) || music.includes(tasteSearchTerm) || mood.includes(tasteSearchTerm) || favorites.includes(tasteSearchTerm) || needs.includes(tasteSearchTerm);
    });
  }

  if (tasteBirthdayTerm) {
    if (tasteBirthdayTerm.length === 5) {
      filtered = filtered.filter((p) => p.birthday === tasteBirthdayTerm);
    } else if (tasteBirthdayTerm.length === 2) {
      filtered = filtered.filter((p) => p.birthday && p.birthday.startsWith(tasteBirthdayTerm + '-'));
    }
  }

  if (tasteActiveFilter !== 'all') {
    filtered = filtered.filter((p) => {
      const t = p.tastes || {};
      const arr = t[tasteActiveFilter];
      return Array.isArray(arr) && arr.length > 0;
    });
  }

  if (filtered.length === 0) {
    list.innerHTML = `<p class="empty-message">아직 이 숲에는 당신밖에 없어요.<br><span style="color:#BBB; font-size:11px;">친구에게 도토리숲을 알려주세요.</span></p>`;
    return;
  }

  list.innerHTML = '';
  filtered.forEach((p) => {
    list.appendChild(renderTasteCard(p));
  });
}

function renderTasteCard(profile) {
  const card = document.createElement('div');
  card.className = 'taste-card';
  const t = profile.tastes || {};
  const tags = [];
  if (t.interests && t.interests.length) tags.push(...t.interests.slice(0, 2));
  if (t.music && t.music.length) tags.push(...t.music.slice(0, 1));
  if (t.mood && t.mood.length) tags.push(...t.mood.slice(0, 1));

  const matchBar = profile.matchScore > 0
    ? `<div class="match-bar"><div class="match-fill" style="width:${profile.matchScore}%"></div><span class="match-label">🌰 ${profile.matchScore}% 취향이 비슷해요</span></div>`
    : `<div class="match-bar match-bar-empty"><span class="match-label">🌰 아직 겹치는 취향이 없어요</span></div>`;

  const reasonLine = profile.matchReasons && profile.matchReasons.length
    ? `<p class="match-reasons">${escapeHtml(profile.matchReasons.slice(0, 3).join(' · '))}</p>`
    : '';

  card.innerHTML = `
    <div class="taste-card-left">
      <div class="taste-avatar" style="background:${profile.mini_me_bg || '#EAF6FF'};">${profile.mini_me || '🌰'}</div>
    </div>
    <div class="taste-card-right">
      <div class="taste-card-name">${escapeHtml(profile.nickname)}</div>
      <div class="taste-card-status">${escapeHtml(profile.status_message || '')}</div>
      ${tags.length ? `<div class="taste-tags">${tags.map((tag) => `<span class="taste-tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
      ${t.needs ? `<div class="taste-needs-line">"${escapeHtml(t.needs)}"</div>` : ''}
      ${matchBar}
      ${reasonLine}
      <div class="taste-actions">
        <button class="small-btn visit-btn" data-dotori="${profile.dotori_id}">방문하기</button>
        <button class="small-btn primary note-btn" data-dotori="${profile.dotori_id}" data-nickname="${escapeHtml(profile.nickname)}">쪽지 보내기</button>
      </div>
    </div>
  `;

  card.querySelector('.visit-btn').addEventListener('click', async () => {
    const target = await DotoriStorage.getProfileByDotoriId(profile.dotori_id);
    if (target) window.openVisitModal(target);
  });

  card.querySelector('.note-btn').addEventListener('click', () => {
    openNoteWriter(profile.dotori_id, profile.nickname);
  });

  return card;
}

async function openNoteWriter(recipientDotoriId, recipientNickname) {
  showModal('쪽지 보내기',
    `<div class="editor-form"><p class="note-to">To. <strong>${escapeHtml(recipientNickname)}</strong></p><label>메시지 <span class="hint">최대 300자</span></label><textarea id="note-message" maxlength="300" rows="4" placeholder="작은 안부를 전해보세요." class="editor-input"></textarea></div>`,
    [
      { label: '취소', onClick: closeModal },
      { label: '보내기', primary: true, onClick: async () => {
        const msg = document.getElementById('note-message').value.trim();
        if (!msg) return;
        try {
          await DotoriStorage.sendNote(recipientDotoriId, msg);
          closeModal();
        } catch (err) { alert('쪽지를 보낼 수 없어요.'); }
      }}
    ]
  );
}