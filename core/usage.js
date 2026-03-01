// Ouroboros — Usage Counter
// Tracks daily improvements, resets at midnight local time
// Enforces free tier limit and blocks copy/paste in trial mode

// ── Storage key helpers ──────────────────────────────────────────────────
function todayKey() {
  const d = new Date();
  return `usage_${d.getFullYear()}_${d.getMonth() + 1}_${d.getDate()}`;
}

// ── Get today's usage ────────────────────────────────────────────────────
export async function getTodayUsage() {
  const key = todayKey();
  const data = await chrome.storage.local.get(key);
  return data[key] || 0;
}

// ── Increment usage count ────────────────────────────────────────────────
export async function incrementUsage() {
  const key = todayKey();
  const current = await getTodayUsage();
  const next = current + 1;
  await chrome.storage.local.set({ [key]: next });
  console.log(`[Ouroboros] Usage today: ${next}`);
  return next;
}

// ── Check if user can optimize ───────────────────────────────────────────
// Returns { allowed, used, limit, isLicensed, isBetaActive }
export async function checkUsageAllowed(dailyLimit, isLicensed, isBetaActive) {
  // Licensed users always allowed
  if (isLicensed) {
    return { allowed: true, used: null, limit: null, isLicensed: true };
  }

  // Before launch date — allow everyone (soft beta mode)
  if (!isBetaActive) {
    return { allowed: true, used: null, limit: null, isBetaActive: false };
  }

  const used = await getTodayUsage();

  // Hard block after limit
  if (used >= dailyLimit) {
    return { allowed: false, used, limit: dailyLimit, isLicensed: false };
  }

  return { allowed: true, used, limit: dailyLimit, isLicensed: false };
}

// ── Reset usage (for testing / manual clear) ─────────────────────────────
export async function resetTodayUsage() {
  const key = todayKey();
  await chrome.storage.local.remove(key);
  console.log('[Ouroboros] Usage counter reset');
}

// ── Clean up old usage keys (keep last 7 days) ───────────────────────────
export async function pruneOldUsageKeys() {
  const all = await chrome.storage.local.get(null);
  const keysToRemove = [];
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const key of Object.keys(all)) {
    if (!key.startsWith('usage_')) continue;

    // Parse date from key: usage_YYYY_M_D
    const parts = key.split('_');
    if (parts.length !== 4) continue;

    const keyDate = new Date(
      parseInt(parts[1]),
      parseInt(parts[2]) - 1,
      parseInt(parts[3])
    );

    if (keyDate.getTime() < cutoff) {
      keysToRemove.push(key);
    }
  }

  if (keysToRemove.length > 0) {
    await chrome.storage.local.remove(keysToRemove);
    console.log(`[Ouroboros] Pruned ${keysToRemove.length} old usage keys`);
  }
}

// ── Copy/paste blocking ──────────────────────────────────────────────────
// Called from drawer when user is in trial mode and hits the limit
// Injects a content script message to block clipboard on the improved prompt

export function buildTrialBlockedResult(original) {
  return {
    original,
    improved: null,
    blocked: true,
    reason: 'daily_limit_reached',
  };
}

// Returns masked text so the improved prompt is not readable/copyable in trial
export function maskImprovedPrompt(text) {
  if (!text) return '';

  const words = text.split(' ');
  const visibleCount = Math.min(8, Math.floor(words.length * 0.2));
  const visible = words.slice(0, visibleCount).join(' ');
  const masked = words.slice(visibleCount).map(() => '█').join(' ');

  return `${visible} ${masked}`;
}
