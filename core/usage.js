// Ouroboros — Usage Counter v3
// 10-attempt limit with 1.5-hour cooldown
// Keyed per-account: each email gets its own local key
// Supabase is the persistent store — local is the working copy
// Anonymous users: local only, no Supabase

import { pushUsageToSupabase } from './license.js';

const ATTEMPT_LIMIT = 10;
const COOLDOWN_MS   = 1.5 * 60 * 60 * 1000; // 1.5 hours

// ── Storage key scoped to account ────────────────────────────────────────
function storageKey(email) {
  if (!email) return 'attemptState_anon';
  const safe = email.toLowerCase().trim().replace(/[^a-z0-9@._-]/g, '_');
  return `attemptState_${safe}`;
}

// ── Seed local state from Supabase on sign-in ─────────────────────────────
// Called once after login. Sets the local counter to match Supabase.
export async function seedAttemptState(email, supabaseUsage) {
  if (!email || !supabaseUsage) return;
  const key = storageKey(email);
  await chrome.storage.local.set({
    [key]: {
      count:         supabaseUsage.attemptCount  || 0,
      cooldownUntil: supabaseUsage.cooldownUntil || null,
    }
  });
  console.log(`[Ouroboros] Seeded usage from Supabase: ${supabaseUsage.attemptCount} attempts`);
}

// ── Get current state for an account ─────────────────────────────────────
export async function getAttemptState(email) {
  const key  = storageKey(email);
  const data = await chrome.storage.local.get(key);
  const state = data[key] || { count: 0, cooldownUntil: null };

  // Auto-reset if cooldown has expired
  if (state.cooldownUntil && Date.now() >= state.cooldownUntil) {
    const fresh = { count: 0, cooldownUntil: null };
    await chrome.storage.local.set({ [key]: fresh });
    // Reset Supabase row too — fire and forget
    if (email) pushUsageToSupabase(email, 0, null);
    return fresh;
  }

  return state;
}

// ── Record one attempt ────────────────────────────────────────────────────
// Returns { count, cooldownUntil, justTriggeredCooldown }
export async function recordAttempt(email) {
  const key   = storageKey(email);
  const state = await getAttemptState(email);

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
  await chrome.storage.local.set({ [key]: newState });

  // Push to Supabase — fire and forget, non-blocking
  if (email) pushUsageToSupabase(email, newCount, cooldownUntil);

  console.log(`[Ouroboros] ${email || 'anon'} — attempt ${newCount}/${ATTEMPT_LIMIT}`, cooldownUntil ? '— cooldown started' : '');
  return { ...newState, justTriggeredCooldown };
}

// ── Check if optimization is allowed ─────────────────────────────────────
export async function checkUsageAllowed(isLicensed, email) {
  // Licensed users (beta/pro) — always allowed, skip counter
  if (isLicensed) {
    return { allowed: true, count: null, limit: null, isLicensed: true };
  }

  const state = await getAttemptState(email);
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

  return {
    allowed: true,
    count: state.count,
    limit: ATTEMPT_LIMIT,
    cooldownUntil: null,
    cooldownRemainingMs: 0,
    isLicensed: false,
  };
}

// ── Reset counter for an account ─────────────────────────────────────────
export async function resetAttempts(email) {
  const key = storageKey(email);
  await chrome.storage.local.set({ [key]: { count: 0, cooldownUntil: null } });
  console.log(`[Ouroboros] Attempt counter reset for ${email || 'anon'}`);
}

// ── Prune legacy v1 date-keyed entries ───────────────────────────────────
export async function pruneOldUsageKeys() {
  const all = await chrome.storage.local.get(null);
  const toRemove = Object.keys(all).filter(k => k.startsWith('usage_'));
  if (toRemove.length) {
    await chrome.storage.local.remove(toRemove);
    console.log(`[Ouroboros] Pruned ${toRemove.length} legacy usage keys`);
  }
}

// ── Mask improved text for trial users ───────────────────────────────────
export function maskImprovedPrompt(text) {
  if (!text) return '';
  const words = text.split(' ');
  const visibleCount = Math.min(8, Math.floor(words.length * 0.2));
  const visible = words.slice(0, visibleCount).join(' ');
  const masked  = words.slice(visibleCount).map(() => '█').join(' ');
  return `${visible} ${masked}`;
}

// ── Format cooldown time ──────────────────────────────────────────────────
// Shows seconds when under 5 minutes for a live countdown feel
export function formatCooldown(ms) {
  if (ms <= 0) return '0m';
  const totalSeconds = Math.ceil(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  // Under 5 minutes — show seconds too
  if (ms < 5 * 60 * 1000) {
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  // Over 5 minutes — hours and minutes only
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}