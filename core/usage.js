// Ouroboros — Usage Counter v2
// 5-attempt limit with 2-hour cooldown (not midnight reset)
// Attempts = "Use this" clicks + copy events (debounced 2s)
// "Use original" never counts

const ATTEMPT_LIMIT = 5;
const COOLDOWN_MS   = 2 * 60 * 60 * 1000; // 2 hours
const STORAGE_KEY   = 'attemptState';

// ── Attempt state shape ──────────────────────────────────────────────────
// { count: number, cooldownUntil: number | null }
// cooldownUntil = timestamp (ms) when cooldown expires, or null if not active

// ── Get current state ────────────────────────────────────────────────────
export async function getAttemptState() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const state = data[STORAGE_KEY] || { count: 0, cooldownUntil: null };

  // If cooldown has expired, reset the counter automatically
  if (state.cooldownUntil && Date.now() >= state.cooldownUntil) {
    const fresh = { count: 0, cooldownUntil: null };
    await chrome.storage.local.set({ [STORAGE_KEY]: fresh });
    return fresh;
  }

  return state;
}

// ── Check if in cooldown ─────────────────────────────────────────────────
export async function isInCooldown() {
  const state = await getAttemptState();
  return state.cooldownUntil !== null && Date.now() < state.cooldownUntil;
}

// ── Ms remaining in cooldown (0 if not in cooldown) ─────────────────────
export async function getCooldownRemaining() {
  const state = await getAttemptState();
  if (!state.cooldownUntil) return 0;
  return Math.max(0, state.cooldownUntil - Date.now());
}

// ── Record one attempt (accept or copy) ──────────────────────────────────
// Returns updated state: { count, cooldownUntil, justTriggeredCooldown }
export async function recordAttempt() {
  const state = await getAttemptState();

  // Already in cooldown — don't increment further
  if (state.cooldownUntil && Date.now() < state.cooldownUntil) {
    return { ...state, justTriggeredCooldown: false };
  }

  const newCount = state.count + 1;
  let cooldownUntil = null;
  let justTriggeredCooldown = false;

  if (newCount >= ATTEMPT_LIMIT) {
    cooldownUntil = Date.now() + COOLDOWN_MS;
    justTriggeredCooldown = true;
  }

  const newState = { count: newCount, cooldownUntil };
  await chrome.storage.local.set({ [STORAGE_KEY]: newState });

  console.log(`[Ouroboros] Attempt ${newCount}/${ATTEMPT_LIMIT}`, cooldownUntil ? '— cooldown started' : '');
  return { ...newState, justTriggeredCooldown };
}

// ── Check if optimization is allowed ────────────────────────────────────
// Returns { allowed, count, limit, cooldownUntil, cooldownRemainingMs }
export async function checkUsageAllowed(isLicensed) {
  // Licensed users — always allowed
  if (isLicensed) {
    return { allowed: true, count: null, limit: null, isLicensed: true };
  }

  const state = await getAttemptState();
  const inCooldown = state.cooldownUntil && Date.now() < state.cooldownUntil;

  if (inCooldown) {
    return {
      allowed: false,
      count: state.count,
      limit: ATTEMPT_LIMIT,
      cooldownUntil: state.cooldownUntil,
      cooldownRemainingMs: state.cooldownUntil - Date.now(),
      isLicensed: false,
    };
  }

  // Under limit — allow
  return {
    allowed: true,
    count: state.count,
    limit: ATTEMPT_LIMIT,
    cooldownUntil: null,
    cooldownRemainingMs: 0,
    isLicensed: false,
  };
}

// ── Reset (for testing / manual clear) ──────────────────────────────────
export async function resetAttempts() {
  await chrome.storage.local.set({ [STORAGE_KEY]: { count: 0, cooldownUntil: null } });
  console.log('[Ouroboros] Attempt counter reset');
}

// ── Legacy compat — called from service-worker onStartup ────────────────
export async function pruneOldUsageKeys() {
  // Remove old date-keyed entries from v1
  const all = await chrome.storage.local.get(null);
  const toRemove = Object.keys(all).filter(k => k.startsWith('usage_'));
  if (toRemove.length) {
    await chrome.storage.local.remove(toRemove);
    console.log(`[Ouroboros] Pruned ${toRemove.length} legacy usage keys`);
  }
}

// ── Mask improved text for trial users on last attempt ──────────────────
export function maskImprovedPrompt(text) {
  if (!text) return '';
  const words = text.split(' ');
  const visibleCount = Math.min(8, Math.floor(words.length * 0.2));
  const visible = words.slice(0, visibleCount).join(' ');
  const masked  = words.slice(visibleCount).map(() => '█').join(' ');
  return `${visible} ${masked}`;
}

// ── Format cooldown time as "Xh Ym" or "Xm" ────────────────────────────
export function formatCooldown(ms) {
  if (ms <= 0) return '0m';
  const totalMinutes = Math.ceil(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}
