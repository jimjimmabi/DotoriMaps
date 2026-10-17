// ============================================
// Dotorimaps — Supabase Adapter
// ============================================

const SUPABASE_URL_FALLBACK = 'https://xdqmsrferkstomzytkoh.supabase.co';
const SUPABASE_ANON_KEY_FALLBACK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkcW1zcmZlcmtzdG9tenl0a29oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4NzU5NzksImV4cCI6MjEwNjQ1MTk3OX0.d-XCXnr8LVDcoFpZCKRMfBY3x0YdupUsJHDcyX7zEB4';

// Note: If you have a config.js, you can keep using window.SUPABASE_URL. 
// Otherwise, this falls back to the hardcoded keys.
const sb = window.supabase.createClient(
  window.SUPABASE_URL || SUPABASE_URL_FALLBACK,
  window.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY_FALLBACK
);

async function getMyAcorn() {
  const myId = localStorage.getItem('dotori_my_id');
  if (!myId) return null;
  
  const { data, error } = await sb.from('profiles').select('*').eq('dotori_id', myId).single();
  if (error) {
    localStorage.removeItem('dotori_my_id');
    localStorage.removeItem('dotori_session');
    return null;
  }
  return data;
}

async function loginByDotoriId(dotoriId) {
  const cleaned = String(dotoriId).trim().toLowerCase();
  const { data: profile, error } = await sb.from('profiles').select('*').eq('dotori_id', cleaned).single();
  if (error || !profile) return null;

  // Ensure we have an active Supabase session so RLS allows us to read/write
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    const { error: authError } = await sb.auth.signInAnonymously();
    if (authError) throw authError;
  }

  localStorage.setItem('dotori_my_id', profile.dotori_id);
  localStorage.setItem('dotori_session', JSON.stringify({ loggedIn: true, dotori_id: profile.dotori_id, user_id: profile.id, is_owner: true }));
  return profile;
}

async function logout() {
  await sb.auth.signOut();
  localStorage.removeItem('dotori_session');
  localStorage.removeItem('dotori_my_id');
}

// Expose only what the map needs
window.DotoriStorage = {
  getMyAcorn,
  loginByDotoriId,
  logout
};