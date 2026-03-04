// Ouroboros — License & Remote Config
// Email-based identity — no passwords, no magic links
// Tier: beta (unlimited) | trial (5-attempt cooldown) | none (same as trial)

const SUPABASE_URL      = 'https://igwbzpdtyuyowzgbissj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlnd2J6cGR0eXV5b3d6Z2Jpc3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNzM4ODMsImV4cCI6MjA4NzY0OTg4M30.z19H30GlmM75erma1V9yIdQLdC-BGE9kGiZ7AS1m-KI';

const HEADERS = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
};

// Remote config is the only thing still cached — it's static metadata
// (launch date, free limit) and doesn't affect identity correctness
const CACHE_KEY_CONFIG  = 'remoteConfig';
const CONFIG_CACHE_TTL  = 60 * 60 * 1000; // 1 hour

// ── Remote config ────────────────────────────────────────────────────────
export async function getRemoteConfig() {
  const { remoteConfig } = await chrome.storage.local.get(CACHE_KEY_CONFIG);
  if (remoteConfig?.cachedAt && (Date.now() - remoteConfig.cachedAt) < CONFIG_CACHE_TTL) {
    return remoteConfig.data;
  }
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ouroboros_config?select=key,value`,
      { headers: HEADERS }
    );
    if (!res.ok) throw new Error(`Config fetch failed: ${res.status}`);
    const rows = await res.json();
    const config = {};
    rows.forEach(row => { config[row.key] = row.value; });
    await chrome.storage.local.set({ [CACHE_KEY_CONFIG]: { data: config, cachedAt: Date.now() } });
    console.log('[Ouroboros] Remote config loaded:', config);
    return config;
  } catch (err) {
    console.warn('[Ouroboros] Remote config fetch failed, using defaults:', err.message);
    return { launch_date: '2026-03-10', beta_active: 'true', free_daily_limit: '5' };
  }
}

export async function isLaunched() {
  const config = await getRemoteConfig();
  return new Date() >= new Date(config.launch_date);
}

export async function getLaunchDate() {
  const config = await getRemoteConfig();
  return new Date(config.launch_date);
}

export async function getDailyLimit() {
  const config = await getRemoteConfig();
  return parseInt(config.free_daily_limit || '5', 10);
}

// ── Lookup user by email ─────────────────────────────────────────────────
// Returns { found, email, licenseType, validUntil, isActive, reason? }
export async function lookupEmail(email) {
  if (!email || !email.includes('@')) {
    return { found: false, reason: 'Invalid email' };
  }
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ouroboros_licenses?email=eq.${encodeURIComponent(email.toLowerCase().trim())}&select=email,license_type,valid_until,is_active`,
      { headers: HEADERS }
    );
    if (!res.ok) throw new Error(`Lookup failed: ${res.status}`);
    const rows = await res.json();
    if (!rows || rows.length === 0) return { found: false, reason: 'Email not found' };
    const row = rows[0];
    if (!row.is_active) return { found: true, email: row.email, licenseType: 'none', reason: 'Account inactive' };
    if (row.valid_until && new Date() > new Date(row.valid_until)) {
      return { found: true, email: row.email, licenseType: 'none', reason: 'License expired' };
    }
    return { found: true, email: row.email, licenseType: row.license_type, validUntil: row.valid_until, isActive: true };
  } catch (err) {
    console.warn('[Ouroboros] Email lookup failed:', err.message);
    return { found: false, reason: 'Could not verify — check your connection' };
  }
}

// ── Save identity after login ─────────────────────────────────────────────
// Writes to sync storage only — this is the single persistent source of truth
export async function saveUserIdentity(email, licenseType) {
  await chrome.storage.sync.set({
    userEmail:   email,
    licenseType: licenseType || 'free',
  });
  console.log(`[Ouroboros] Identity saved: ${email} (${licenseType})`);
}

// ── Fetch usage state from Supabase ───────────────────────────────────────
// Called at sign-in to seed the local attempt counter from the real value.
// Returns { attemptCount, cooldownUntil } or null on failure.
export async function fetchUsageFromSupabase(email) {
  if (!email) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ouroboros_usage?email=eq.${encodeURIComponent(email)}&select=attempt_count,cooldown_until`,
      { headers: HEADERS }
    );
    if (!res.ok) throw new Error(`Usage fetch failed: ${res.status}`);
    const rows = await res.json();
    if (!rows || rows.length === 0) return { attemptCount: 0, cooldownUntil: null };
    const row = rows[0];
    return {
      attemptCount:  row.attempt_count  || 0,
      cooldownUntil: row.cooldown_until ? new Date(row.cooldown_until).getTime() : null,
    };
  } catch (err) {
    console.warn('[Ouroboros] Could not fetch usage from Supabase:', err.message);
    return null; // fall back to local state
  }
}

// ── Write usage state to Supabase ─────────────────────────────────────────
// Fire-and-forget — never blocks the UI.
// Called after every accepted improvement for trial users.
export async function pushUsageToSupabase(email, attemptCount, cooldownUntil) {
  if (!email) return;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ouroboros_usage?on_conflict=email`,
      {
        method: 'POST',
        headers: { ...HEADERS, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          email,
          attempt_count:  attemptCount,
          cooldown_until: cooldownUntil ? new Date(cooldownUntil).toISOString() : null,
          updated_at:     new Date().toISOString(),
        }),
      }
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Usage push failed (${res.status}): ${errText}`);
    }
    console.log(`[Ouroboros] Usage synced to Supabase: ${attemptCount} attempts`);
  } catch (err) {
    console.warn('[Ouroboros] Could not push usage to Supabase:', err.message);
    // Non-fatal — local state is still correct
  }
}

// ── Full wipe — called on sign-out ────────────────────────────────────────
// Clears everything: identity, backend config, attempt counters, library.
// User gets a completely clean slate. Supabase is unaffected.
export async function clearAllData() {
  await chrome.storage.sync.clear();
  await chrome.storage.local.clear();
  console.log('[Ouroboros] Clean slate — all local data cleared');
}

// Legacy compat — anything that called clearUserIdentity now does a full wipe
export async function clearUserIdentity() {
  await clearAllData();
}

export async function clearLicenseCache() {
  await chrome.storage.local.remove(CACHE_KEY_CONFIG);
}

// ── Check license — reads sync storage directly, no cache ─────────────────
// Login wrote userEmail + licenseType to sync storage.
// Sign-out wiped sync storage. No stale state possible.
// valid = true only for beta/pro (unlimited, counter bypassed).
export async function checkLicense() {
  const stored = await chrome.storage.sync.get(['userEmail', 'licenseType']);
  const email       = stored.userEmail   || null;
  const licenseType = stored.licenseType || 'free';
  return {
    valid:       licenseType === 'beta' || licenseType === 'pro',
    licenseType,
    email,
  };
}