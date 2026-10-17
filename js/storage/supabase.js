// ============================================
// 도토리숲 — Supabase Storage Adapter (v2)
// ============================================

const SUPABASE_URL_FALLBACK = 'https://xdqmsrferkstomzytkoh.supabase.co';
const SUPABASE_ANON_KEY_FALLBACK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkcW1zcmZlcmtzdG9tenl0a29oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4NzU5NzksImV4cCI6MjEwNjQ1MTk3OX0.d-XCXnr8LVDcoFpZCKRMfBY3x0YdupUsJHDcyX7zEB4';

const sb = window.supabase.createClient(
  window.SUPABASE_URL || SUPABASE_URL_FALLBACK,
  window.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY_FALLBACK
);

const MAX_ILCHON = 12;

// ---------- Auth & Profile ----------
async function createAcorn(nickname) {
  const { data: { session: existingSession } } = await sb.auth.getSession();
  let userId;

  if (existingSession && existingSession.user) {
    userId = existingSession.user.id;
  } else {
    const { data: authData, error: authError } = await sb.auth.signInAnonymously();
    if (authError) throw authError;
    userId = authData.user.id;
  }

  const { data: existingProfile } = await sb.from('profiles').select('*').eq('id', userId).single();

  if (existingProfile) {
    const { data: updated, error: updateError } = await sb.from('profiles').update({ nickname }).eq('id', userId).select().single();
    if (updateError) {
      if (updateError.code === '23505') throw new Error('이미 누군가 사용하고 있는 닉네임이에요.');
      throw updateError;
    }
    localStorage.setItem('dotori_session', JSON.stringify({ loggedIn: true, dotori_id: updated.dotori_id, user_id: updated.id, is_owner: true }));
    localStorage.setItem('dotori_my_id', updated.dotori_id);
    return updated;
  }

  const dotoriId = 'dotori-' + Math.random().toString(36).substring(2, 6);
  const { data: profile, error: profileError } = await sb.from('profiles').insert([{
    id: userId, dotori_id: dotoriId, nickname, status_message: '오늘도 화이팅 ♡', mini_me: '🌰', mini_me_bg: '#EAF6FF',
    tastes: { interests: [], music: [], mood: [], favorites: '', currently: '', needs: '' }
  }]).select().single();

  if (profileError) {
    if (profileError.code === '23505') throw new Error('이미 누군가 사용하고 있는 닉네임이에요.');
    throw profileError;
  }

  await sb.from('rooms').insert([{ user_id: userId }]);
  localStorage.setItem('dotori_session', JSON.stringify({ loggedIn: true, dotori_id: dotoriId, user_id: userId, is_owner: true }));
  localStorage.setItem('dotori_my_id', dotoriId);
  return profile;
}

async function loadAcorn() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  if (error) return null;
  
  localStorage.setItem('dotori_session', JSON.stringify({ loggedIn: true, dotori_id: data.dotori_id, user_id: data.id, is_owner: true }));
  localStorage.setItem('dotori_my_id', data.dotori_id);
  return data;
}

async function loginByDotoriId(dotoriId) {
  const cleaned = String(dotoriId).trim().toLowerCase();
  const { data: profile, error } = await sb.from('profiles').select('*').eq('dotori_id', cleaned).single();
  if (error || !profile) return null;

  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    const { error: authError } = await sb.auth.signInAnonymously();
    if (authError) throw authError;
  }

  localStorage.setItem('dotori_my_id', profile.dotori_id);
  localStorage.setItem('dotori_session', JSON.stringify({ loggedIn: true, dotori_id: profile.dotori_id, user_id: profile.id, is_owner: true }));
  return profile;
}

async function getMyAcorn() {
  const myId = localStorage.getItem('dotori_my_id');
  if (!myId) return null;
  const { data, error } = await sb.from('profiles').select('*').eq('dotori_id', myId).single();
  if (error) return null;
  return data;
}

async function getProfile() {
  const myId = localStorage.getItem('dotori_my_id');
  if (myId) {
    const { data, error } = await sb.from('profiles').select('*').eq('dotori_id', myId).single();
    if (!error && data) return data;
  }
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).single();
  if (error) return null;
  return data;
}

async function getProfileByDotoriId(dotoriId) {
  const { data, error } = await sb.from('profiles').select('*').eq('dotori_id', dotoriId).single();
  if (error) return null;
  return data;
}

async function updateProfile(updates) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data, error } = await sb.from('profiles').update(updates).eq('id', user.id).select().single();
  if (error) {
    if (error.code === '23505') throw new Error('이미 누군가 사용하고 있는 닉네임이에요.');
    throw error;
  }
  return data;
}

function getSession() {
  try {
    const raw = localStorage.getItem('dotori_session');
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

async function logout() {
  await sb.auth.signOut();
  localStorage.removeItem('dotori_session');
}

// ---------- Data Sync (Room & BGM) ----------
async function getRoom() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { layout: {}, wallpaper: 'default', floor: 'default', bgm_choice: null };
  const { data, error } = await sb.from('rooms').select('*').eq('user_id', user.id).single();
  if (error) return { layout: {}, wallpaper: 'default', floor: 'default', bgm_choice: null };
  return data;
}

async function getRoomByDotoriId(dotoriId) {
  const owner = await getProfileByDotoriId(dotoriId);
  if (!owner) return null;
  const { data, error } = await sb.from('rooms').select('*').eq('user_id', owner.id).single();
  if (error) return { layout: {}, wallpaper: 'default', floor: 'default', bgm_choice: null };
  return data;
}

async function saveMyRoom(room) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return false;
  const { error } = await sb.from('rooms').update({
    layout: room.layout || {}, wallpaper: room.wallpaper || 'default', floor: room.floor || 'default',
    bgm_choice: room.bgm_choice || null, updated_at: new Date().toISOString()
  }).eq('user_id', user.id);
  return !error;
}

async function saveMyBGM(choiceId) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return false;
  const { error } = await sb.from('rooms').update({
    bgm_choice: choiceId || null, updated_at: new Date().toISOString()
  }).eq('user_id', user.id);
  return !error;
}

// ---------- Explore & Friends ----------
async function getAllProfiles() {
  const { data, error } = await sb.from('profiles')
    .select('dotori_id, nickname, status_message, mini_me, mini_me_bg, tastes, birthday, created_at')
    .order('created_at', { ascending: false }).limit(100);
  if (error) return [];
  return data;
}

async function getIlchon() {
  const me = await getProfile();
  if (!me) return [];
  const { data, error } = await sb.from('ilchon').select('*').or(`user_a.eq.${me.id},user_b.eq.${me.id}`);
  if (error) return [];
  const friendIds = data.map(row => row.user_a === me.id ? row.user_b : row.user_a);
  if (friendIds.length === 0) return [];
  const { data: friends } = await sb.from('profiles').select('id, dotori_id, nickname, mini_me, mini_me_bg, status_message').in('id', friendIds);
  return friends || [];
}

async function isIlchon(dotoriId) {
  const me = await getProfile();
  if (!me) return false;
  const other = await getProfileByDotoriId(dotoriId);
  if (!other) return false;
  const [a, b] = [me.id, other.id].sort();
  const { data, error } = await sb.from('ilchon').select('*').eq('user_a', a).eq('user_b', b).maybeSingle();
  return !!data;
}

// ---------- Match Score (Includes Birthday) ----------
function calculateMatch(myTastes, theirTastes, myBirthday, theirBirthday) {
  if (!myTastes || !theirTastes) return { score: 0, reasons: [] };
  let score = 0;
  const reasons = [];

  const sharedInterests = (myTastes.interests || []).filter((i) => (theirTastes.interests || []).includes(i));
  if (sharedInterests.length >= 3) { score += 30; reasons.push(`관심사 ${sharedInterests.length}개 겹침`); }
  else if (sharedInterests.length > 0) { score += sharedInterests.length * 10; reasons.push(`관심사 ${sharedInterests.length}개 겹침`); }

  if ((myTastes.music || []).some((m) => (theirTastes.music || []).includes(m))) { score += 25; reasons.push('음악 취향 겹침'); }
  if ((myTastes.mood || []).some((m) => (theirTastes.mood || []).includes(m))) { score += 20; reasons.push('감성 겹침'); }

  const myFav = (myTastes.favorites || '').split(',').map((s) => s.trim()).filter(Boolean);
  const theirFav = (theirTastes.favorites || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (myFav.filter((f) => theirFav.some((tf) => tf.includes(f) || f.includes(tf))).length > 0) {
    score += 15; reasons.push(`"${myFav.slice(0, 3).join(', ')}" 겹침`);
  }

  if (myBirthday && theirBirthday) {
    if (myBirthday === theirBirthday) { score += 15; reasons.push('🎂 같 은 날 생일'); }
    else if (myBirthday.split('-')[0] === theirBirthday.split('-')[0]) { score += 8; reasons.push('🎂 같 은 달 생일'); }
  }

  return { score: Math.min(score, 100), reasons };
}

// ---------- Export to Window ----------
window.DotoriSupabase = {
  MAX_ILCHON,
  createAcorn, loadAcorn, loginByDotoriId, getMyAcorn, getProfile, getProfileByDotoriId, updateProfile, getSession, logout,
  getRoom, getRoomByDotoriId, saveMyRoom, saveMyBGM,
  getAllProfiles, getIlchon, isIlchon, calculateMatch
};