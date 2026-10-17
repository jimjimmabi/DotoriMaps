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

  // Logout
  if (logoutLink) {
    logoutLink.addEventListener('click', async (e) => {
      e.preventDefault();
      showModal('알림', '숲에서 나가시겠어요?', [
        { label: '취소', onClick: closeModal },
        { label: '나가기', primary: true, onClick: async () => {
          await DotoriStorage.logout();
          closeModal();
          location.reload();
        }}
      ]);
    });
  }

  // Restore session
  try {
    const myAcorn = await DotoriStorage.getMyAcorn();
    if (myAcorn) {
      showMainSite(myAcorn);
      return;
    }
  } catch (e) { console.warn('Restore failed', e); }

  // Create Acorn
  createBtn.addEventListener('click', async () => {
    const nickname = nicknameInput.value.trim();
    if (!nickname) {
      showModal('알림', '닉네임을 입력해주세요.', [{ label: '확인', primary: true, onClick: closeModal }]);
      return;
    }
    createBtn.disabled = true;
    createBtn.textContent = '만드는 중...';
    try {
      const profile = await DotoriStorage.createAcorn(nickname);
      showModal('🌰 도토리가 만들어졌어요!', 
        `당신의 ID는 <strong>${profile.dotori_id}</strong> 입니다.<br><br>이 ID를 꼭 저장해두세요!`,
        [{ label: '숲으로 들어가기', primary: true, onClick: () => { closeModal(); showMainSite(profile); } }]
      );
    } catch (err) {
      showModal('오류', err.message || '도토리를 만들 수 없어요.', [{ label: '확인', primary: true, onClick: closeModal }]);
    } finally {
      createBtn.disabled = false;
      createBtn.textContent = '🌰 새 도토리 만들기';
    }
  });

  // Load Acorn
  loadBtn.addEventListener('click', async () => {
    loadBtn.disabled = true;
    loadBtn.textContent = '불러오는 중...';
    try {
      const profile = await DotoriStorage.loadAcorn();
      if (profile) {
        showMainSite(profile);
      } else {
        showModal('알림', '이 브라우저에 저장된 도토리가 없어요.', [{ label: '확인', primary: true, onClick: closeModal }]);
      }
    } catch (err) {
      showModal('오류', '도토리를 불러올 수 없어요.', [{ label: '확인', primary: true, onClick: closeModal }]);
    } finally {
      loadBtn.disabled = false;
      loadBtn.textContent = '내 도토리 불러오기';
    }
  });

  // Login with DOTORI-ID
  visitBtn.addEventListener('click', () => {
    showModal('도토리 ID로 들어가기',
      `<div class="editor-form">
        <label>도토리 ID</label>
        <input type="text" id="visit-dotori-id" maxlength="20" placeholder="dotori-xxxx" class="editor-input" autocomplete="off">
      </div>`,
      [
        { label: '취소', onClick: closeModal },
        { label: '들어가기', primary: true, onClick: async () => {
          const dotoriId = document.getElementById('visit-dotori-id').value.trim().toLowerCase();
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

  function showMainSite(profile) {
    welcomeScreen.classList.add('hidden');
    mainSite.classList.remove('hidden');
    if (window.initApp) {
      window.initApp(profile);
    }
  }
}