// Ouroboros — License & Remote Config
// Handles key verification, beta status, launch date, config caching

const SUPABASE_URL = 'https://igwbzpdtyuyowzgbissj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlnd2J6cGR0eXV5b3d6Z2Jpc3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNzM4ODMsImV4cCI6MjA4NzY0OTg4M30.z19H30GlmM75erma1V9yIdQLdC-BGE9kGiZ7AS1m-KI';

const HEADERS = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
};

// Cache keys
const CACHE_KEY_CONFIG    = 'remoteConfig';
const CACHE_KEY_LICENSE   = 'licenseStatus';
const CACHE_TTL_MS        = 24 * 60 * 60 * 1000; // 24 hours

// ── Remote config ────────────────────────────────────────────────────────
export async function getRemoteConfig() {
  // Check local cache first
  const { remoteConfig } = await chrome.storage.local.get(CACHE_KEY_CONFIG);

  if (remoteConfig && remoteConfig.cachedAt) {
    const age = Date.now() - remoteConfig.cachedAt;
    if (age < CACHE_TTL_MS) {
      return remoteConfig.data;
    }
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ouroboros_config?select=key,value`,
      { headers: HEADERS }
    );

    if (!res.ok) throw new Error(`Config fetch failed: ${res.status}`);

    const rows = await res.json();

    // Convert array of {key, value} to plain object
    const config = {};
    rows.forEach(row => { config[row.key] = row.value; });

    // Cache it
    await chrome.storage.local.set({
      [CACHE_KEY_CONFIG]: { data: config, cachedAt: Date.now() }
    });

    console.log('[Ouroboros] Remote config loaded:', config);
    return config;

  } catch (err) {
    console.warn('[Ouroboros] Remote config fetch failed, using defaults:', err.message);

    // Safe defaults if network fails
    return {
      launch_date: '2026-03-10',
      beta_active: 'true',
      free_daily_limit: '5',
    };
  }
}

// ── Launch date helpers ──────────────────────────────────────────────────
export async function isLaunched() {
  const config = await getRemoteConfig();
  const launchDate = new Date(config.launch_date);
  return new Date() >= launchDate;
}

export async function getLaunchDate() {
  const config = await getRemoteConfig();
  return new Date(config.launch_date);
}

export async function getDailyLimit() {
  const config = await getRemoteConfig();
  return parseInt(config.free_daily_limit || '5', 10);
}

// ── License verification ─────────────────────────────────────────────────
export async function verifyLicenseKey(licenseKey) {
  if (!licenseKey || !licenseKey.startsWith('OBR-')) {
    return { valid: false, reason: 'Invalid key format' };
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ouroboros_licenses?license_key=eq.${encodeURIComponent(licenseKey)}&select=license_key,license_type,valid_until,is_active`,
      { headers: HEADERS }
    );

    if (!res.ok) throw new Error(`Verification failed: ${res.status}`);

    const rows = await res.json();

    if (!rows || rows.length === 0) {
      return { valid: false, reason: 'Key not found' };
    }

    const license = rows[0];

    if (!license.is_active) {
      return { valid: false, reason: 'Key has been deactivated' };
    }

    const validUntil = new Date(license.valid_until);
    if (new Date() > validUntil) {
      return { valid: false, reason: 'Key has expired', expiredAt: license.valid_until };
    }

    return {
      valid: true,
      licenseType: license.license_type,
      validUntil: license.valid_until,
    };

  } catch (err) {
    console.warn('[Ouroboros] License verification failed:', err.message);
    // On network error, fall back to cached status
    const cached = await getCachedLicenseStatus();
    if (cached && cached.valid) {
      console.log('[Ouroboros] Using cached license status');
      return cached;
    }
    return { valid: false, reason: 'Could not verify — check your connection' };
  }
}

// ── Cache license status ─────────────────────────────────────────────────
export async function cacheLicenseStatus(status) {
  await chrome.storage.local.set({
    [CACHE_KEY_LICENSE]: { ...status, cachedAt: Date.now() }
  });
}

export async function getCachedLicenseStatus() {
  const { licenseStatus } = await chrome.storage.local.get(CACHE_KEY_LICENSE);
  if (!licenseStatus) return null;

  const age = Date.now() - licenseStatus.cachedAt;
  if (age > CACHE_TTL_MS) return null;

  return licenseStatus;
}

// ── Full license check (cached-first) ───────────────────────────────────
export async function checkLicense() {
  const { licenseKey } = await chrome.storage.sync.get('licenseKey');

  if (!licenseKey) {
    return { valid: false, reason: 'No license key configured' };
  }

  // Use cache if fresh
  const cached = await getCachedLicenseStatus();
  if (cached && cached.valid) return cached;

  // Otherwise verify live
  const result = await verifyLicenseKey(licenseKey);
  await cacheLicenseStatus(result);
  return result;
}

// ── Invalidate caches (called on reconfigure) ────────────────────────────
export async function clearLicenseCache() {
  await chrome.storage.local.remove([CACHE_KEY_CONFIG, CACHE_KEY_LICENSE]);
}
