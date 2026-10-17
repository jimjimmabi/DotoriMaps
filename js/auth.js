// ============================================
// 도토리숲 — Auth UI (Supabase-ready)
// ============================================
async function initAuth() {
  const welcomeScreen = document.getElementById('welcome-screen');
  const mainSite = document.getElementById('main-site');
  const nicknameInput = document.getElementById('nickname-input');
  const createBtn = document.getElementById('create-acorn-btn');
  const loadBtn = document.getElementById('load-acorn-btn');
  const visitBtn = document.getElementById('visit-acorn-btn');
  const logoutLink = document.getElementById('logout-link');

  // ---------- Logout (always attached) ----------
  if (logoutLink) {
    logoutLink.addEventListener('click', async (e) => {
      e.preventDefault();
      showModal('알림',
        '숲에서 나가시겠어요?<br><br>' +
        '<span style="color:#888; font-size:11px;">도토리는 숲에 그대로 남아있어요. 다시 들어올 때는 도토리 ID로 들어오세요.</span>',
        [
          { label: '취소', onClick: closeModal },
          { label: '나가기', primary: true, onClick: async () => {
            try { await DotoriStorage.logout(); } catch (err) { console.warn('Logout failed:', err); }
            closeModal();
            location.reload();
          }}
        ]
      );
    });
  }

  // ---------- Restore existing session ----------
  try {
    const myAcorn = await DotoriStorage.getMyAcorn();
    if (myAcorn) {
      showMainSite(myAcorn);
      return;
    }
  } catch (e) {
    console.warn('My acorn restore failed:', e);
  }

  const session = DotoriStorage.getSession();
  if (session && session.loggedIn) {
    try {
      const profile = await DotoriStorage.getProfile();
      if (profile) {
        showMainSite(profile);
        return;
      }
    } catch (e) {
      console.warn('Session restore failed:', e);
    }
  }

  // ---------- Create new acorn ----------
  createBtn.addEventListener('click', async () => {
    const nickname = nicknameInput.value.trim();
    if (!nickname) {
      showModal('알림', '닉네임을 입력해주세요.', [{ label: '확인', primary: true, onClick: closeModal }]);
      return;
    }
    if (nickname.length > 12) {
      showModal('알림', '닉네임은 12자 이하로 입력해주세요.', [{ label: '확인', primary: true, onClick: closeModal }]);
      return;
    }

    createBtn.disabled = true;
    createBtn.textContent = '만드는 중...';

    try {
      const profile = await DotoriStorage.createAcorn(nickname);
      showModal('🌰 도토리가 만들어졌어요!',
        `당신의 도토리 ID는 <strong>${profile.dotori_id}</strong> 입니다.<br><br>` +
        `<span style="color:#888; font-size:11px;">이 ID를 꼭 저장해두세요. 친구들이 당신의 페이지를 방문할 때 사용해요.</span>`,
        [{ label: '숲으로 들어가기', primary: true, onClick: () => { closeModal(); showMainSite(profile); } }]
      );
    } catch (err) {
      console.error('createAcorn failed:', err);
      showModal('오류', '도토리를 만들 수 없어요.<br><span style="color:#888; font-size:11px;">' + (err.message || '알 수 없는 오류') + '</span>', [{ label: '확인', primary: true, onClick: closeModal }]);
    } finally {
      createBtn.disabled = false;
      createBtn.textContent = '🌰 새 도토리 만들기';
    }
  });

  // ---------- Load my acorn (Returning Owner) ----------
  loadBtn.addEventListener('click', async () => {
    loadBtn.disabled = true;
    loadBtn.textContent = '불러오는 중...';
    try {
      const profile = await DotoriStorage.loadAcorn();
      if (profile) {
        showMainSite(profile);
      } else {
        showModal('알림', '이 브라우저에 저장된 도토리가 없어요.<br><span style="color:#888; font-size:11px;">도토리 ID를 알고 있다면 "도토리 ID로 들어가기"를 사용해보세요.</span>', [{ label: '확인', primary: true, onClick: closeModal }]);
      }
    } catch (err) {
      console.error('loadAcorn failed:', err);
      showModal('오류', '도토리를 불러올 수 없어요.<br><span style="color:#888; font-size:11px;">' + (err.message || '') + '</span>', [{ label: '확인', primary: true, onClick: closeModal }]);
    } finally {
      loadBtn.disabled = false;
      loadBtn.textContent = '기존 도토리 불러오기';
    }
  });

  // ---------- Login with DOTORI-ID ----------
  visitBtn.addEventListener('click', () => {
    showModal('도토리 ID로 들어가기',
      `<div class="editor-form">
        <label>도토리 ID</label>
        <input type="text" id="visit-dotori-id" maxlength="20" placeholder="dotori-xxxx" class="editor-input" autocomplete="off">
        <p class="hint" style="margin-top:8px; color:#888; font-size:11px;">저장해둔 도토리 ID를 입력하세요.</p>
      </div>`,
      [
        { label: '취소', onClick: closeModal },
        { label: '들어가기', primary: true, onClick: async () => {
          const input = document.getElementById('visit-dotori-id');
          const dotoriId = input.value.trim().toLowerCase();
          if (!dotoriId) return;
          
          const profile = await DotoriStorage.loginByDotoriId(dotoriId);
          if (profile) {
            closeModal();
            showMainSite(profile);
          } else {
            alert('그런 도토리를 찾을 수 없어요: ' + dotoriId);
          }
        }}
      ]
    );
    setTimeout(() => { document.getElementById('visit-dotori-id')?.focus(); }, 50);
  });

  nicknameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createBtn.click();
  });

  // ---------- Show main site ----------
  function showMainSite(profile) {
    welcomeScreen.classList.add('hidden');
    mainSite.classList.remove('hidden');
    if (window.initApp) {
      window.initApp(profile);
    }
  }
}