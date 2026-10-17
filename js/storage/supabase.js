// ============================================
// Dotorimaps — Supabase Adapter
// ============================================

const SUPABASE_URL_FALLBACK = 'https://xdqmsrferkstomzytkoh.supabase.co';
const SUPABASE_ANON_KEY_FALLBACK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkcW1zcmZlcmtzdG9tenl0a29oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4NzU5NzksImV4cCI6MjEwNjQ1MTk3OX0.d-XCXnr8LVDcoFpZCKRMfBY3x0YdupUsJHDcyX7zEB4';

let sb = null;
if (window.supabase && window.supabase.createClient) {
  sb = window.supabase.createClient(
    window.SUPABASE_URL || SUPABASE_URL_FALLBACK,
    window.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY_FALLBACK
  );
} else {
  console.warn('🌰 Supabase SDK not loaded — DotoriMaps will run without auth.');
}

// If the SDK failed to load, replace every function with a safe no-op fallback.
const OFFLINE = !sb;

// ---------- Helpers ----------

function getSavedDotoriId() {
  try { return localStorage.getItem('dotori_my_id'); } catch (e) { return null; }
}

function saveSession(profile) {
  localStorage.setItem('dotori_my_id', profile.dotori_id);
  localStorage.setItem('dotori_session', JSON.stringify({
    loggedIn: true,
    dotori_id: profile.dotori_id,
    user_id: profile.id,
    is_owner: true
  }));
}

function clearSession() {
  localStorage.removeItem('dotori_my_id');
  localStorage.removeItem('dotori_session');
}

async function ensureAnonSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) return session;
  const { error } = await sb.auth.signInAnonymously();
  if (error) throw error;
  return null;
}

// ---------- Auth ----------

async function getMyAcorn() {
  const myId = getSavedDotoriId();
  if (!myId) return null;

  // Make sure we still have an anon session to read with
  try { await ensureAnonSession(); } catch (e) {}

  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('dotori_id', myId)
    .maybeSingle();

  if (error) {
    // PGRST116 = no rows → the acorn really doesn't exist, clear the local hint.
    // Any other error (network, RLS, 5xx) is transient — don't nuke the session.
    if (error.code === 'PGRST116') clearSession();
    return null;
  }
  if (!data) {
    clearSession();
    return null;
  }
  return data;
}

async function loginByDotoriId(dotoriId, options) {
  const opts = options || {};
  const asVisitor = !!opts.asVisitor;

  const cleaned = String(dotoriId).trim().toLowerCase();
  const { data: profile, error } = await sb
    .from('profiles')
    .select('*')
    .eq('dotori_id', cleaned)
    .maybeSingle();

  if (error || !profile) return null;

  // Ensure we have an active Supabase session so RLS allows us to read/write
  try { await ensureAnonSession(); } catch (e) { throw e; }

  if (!asVisitor) {
    saveSession(profile);
  }

  return profile;
}

async function logout() {
  try { await sb.auth.signOut(); } catch (e) { /* ignore */ }
  clearSession();
}

// ---------- Read-only profile helpers (used by taste.js etc.) ----------

async function getProfileByDotoriId(dotoriId) {
  const cleaned = String(dotoriId).trim().toLowerCase();
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('dotori_id', cleaned)
    .maybeSingle();
  if (error) return null;
  return data;
}

async function getAllProfiles() {
  const { data, error } = await sb
    .from('profiles')
    .select('dotori_id, nickname, status_message, mini_me, mini_me_bg, mini_me_image_url, tastes, birthday, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return [];
  return data || [];
}

// ---------- Match score ----------

function calculateMatch(myTastes, theirTastes, myBirthday, theirBirthday) {
  if (!myTastes || !theirTastes) return { score: 0, reasons: [] };

  let score = 0;
  const reasons = [];

  const myInterests = myTastes.interests || [];
  const theirInterests = theirTastes.interests || [];
  const shared = myInterests.filter((i) => theirInterests.includes(i));
  if (shared.length >= 3) { score += 30; reasons.push(`관심사 ${shared.length}개 겹침`); }
  else if (shared.length > 0) { score += shared.length * 10; reasons.push(`관심사 ${shared.length}개 겹침`); }

  const myMusic = myTastes.music || [];
  const theirMusic = theirTastes.music || [];
  if (myMusic.some((m) => theirMusic.includes(m))) { score += 25; reasons.push('음악 취향 겹침'); }

  const myMood = myTastes.mood || [];
  const theirMood = theirTastes.mood || [];
  if (myMood.some((m) => theirMood.includes(m))) { score += 20; reasons.push('감성 겹침'); }

  const myFav = (myTastes.favorites || '').split(',').map((s) => s.trim()).filter(Boolean);
  const theirFav = (theirTastes.favorites || '').split(',').map((s) => s.trim()).filter(Boolean);
  const sharedFav = myFav.filter((f) => theirFav.some((tf) => tf.includes(f) || f.includes(tf)));
  if (sharedFav.length > 0) {
    score += 15;
    reasons.push(`"${sharedFav.slice(0, 3).join(', ')}" 겹침`);
  }

  if (myBirthday && theirBirthday) {
    if (myBirthday === theirBirthday) { score += 15; reasons.push('같은 날 생일 🎂'); }
    else if (myBirthday.split('-')[0] === theirBirthday.split('-')[0]) {
      score += 8; reasons.push('같은 달 생일 🎂');
    }
  }

  return { score: Math.min(score, 100), reasons };
}

// ---------- Notes (send only) ----------

async function sendNote(recipientDotoriId, message) {
  const me = await getMyAcorn();
  if (!me) throw new Error('내 정보를 찾을 수 없어요');

  const recipient = await getProfileByDotoriId(recipientDotoriId);
  if (!recipient) throw new Error('그런 도토리를 찾을 수 없어요');
  if (recipient.id === me.id) throw new Error('자신에게는 쪽지를 보낼 수 없어요');

  const { data, error } = await sb
    .from('notes')
    .insert([{ sender_id: me.id, recipient_id: recipient.id, message }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ---------- Expose ----------

window.DotoriStorage = {
  // Auth
  getMyAcorn,
  loginByDotoriId,
  logout,

  // Profiles (read-only)
  getProfileByDotoriId,
  getAllProfiles,

  // Taste / match
  calculateMatch,

  // Notes
  sendNote
};