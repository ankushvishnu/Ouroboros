// Ouroboros — Background Service Worker v2
// Handles: LLM routing, Supabase telemetry, license verification, usage enforcement

import { route } from '../core/router.js';
import { getConfig } from '../core/storage.js';
import { getRemoteConfig, checkLicense, isLaunched, clearLicenseCache, lookupEmail, saveUserIdentity, clearAllData, fetchUsageFromSupabase } from '../core/license.js';
import { checkUsageAllowed, recordAttempt, pruneOldUsageKeys, getAttemptState, seedAttemptState } from '../core/usage.js';

// ── Supabase config ─────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://igwbzpdtyuyowzgbissj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlnd2J6cGR0eXV5b3d6Z2Jpc3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNzM4ODMsImV4cCI6MjA4NzY0OTg4M30.z19H30GlmM75erma1V9yIdQLdC-BGE9kGiZ7AS1m-KI';

const SUPABASE_HEADERS = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Prefer': 'return=minimal',
};

// ── Install / Update ────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
  }
  if (details.reason === 'update') {
    console.log('[Ouroboros] Updated to', chrome.runtime.getManifest().version);
    flushRetryQueue();
  }
  // Fetch fresh remote config on install/update
  await getRemoteConfig();
});

chrome.runtime.onStartup.addListener(async () => {
  flushRetryQueue();
  pruneOldUsageKeys();
  // Refresh remote config on browser start
  await getRemoteConfig();
});

// ── Message Router ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((err) => {
      console.error('[Ouroboros] Message handler error:', err);
      sendResponse({ error: err.message || 'Unknown error' });
    });
  return true;
});

async function handleMessage(message, sender) {
  switch (message.type) {

    case 'OPTIMIZE_PROMPT': {
      const { prompt, provenance } = message.payload;
      const config = await getConfig();

      if (!config.configured) {
        return { error: 'NOT_CONFIGURED' };
      }

      // ── License & usage check ──────────────────────────────────────────
      const licenseStatus = await checkLicense();
      const userEmail     = licenseStatus.email || null;

      const usageCheck = await checkUsageAllowed(licenseStatus.valid, userEmail);

      console.log('[Ouroboros] Usage check:', usageCheck);

      if (!usageCheck.allowed) {
        return {
          error: 'DAILY_LIMIT_REACHED',
          count: usageCheck.count,
          limit: usageCheck.limit,
          cooldownUntil: usageCheck.cooldownUntil,
          cooldownRemainingMs: usageCheck.cooldownRemainingMs,
        };
      }

      // ── Run optimization ───────────────────────────────────────────────
      const result = await route({ prompt, provenance, config });

      result.isTrial      = !licenseStatus.valid;
      result.attemptCount = usageCheck.count ?? null;
      result.attemptLimit = 10;

      // Prompt content logging (opt-in)
      if (config.sharePromptContent && result) {
        logPromptContent({
          original: prompt,
          improved: result.improved,
          changes: result.changes,
          complexity: result.complexity,
          backend: config.backend,
        });
      }

      return { result };
    }

    case 'ACCEPT_IMPROVEMENT': {
      // Count every "Use this" for non-licensed users, regardless of launch date
      const licenseStatus = await checkLicense();

      if (!licenseStatus.valid) {
        const newState = await recordAttempt(licenseStatus.email || null);
        console.log(`[Ouroboros] Accept recorded. Attempts: ${newState.count}/5`);
        await logEvent({ type: 'prompt_accepted', ...message.payload });
        return { ok: true, attemptState: newState };
      }

      await logEvent({ type: 'prompt_accepted', ...message.payload });
      return { ok: true, attemptState: null };
    }


    case 'GET_STATUS': {
      const licenseStatus = await checkLicense();
      const attemptState  = await getAttemptState(licenseStatus.email || null);

      const inCooldown = attemptState.cooldownUntil && Date.now() < attemptState.cooldownUntil;

      return {
        licenseStatus,
        attemptState,
        attemptLimit: 10,
        cooldownRemainingMs: inCooldown ? attemptState.cooldownUntil - Date.now() : 0,
        isTrial: !licenseStatus.valid,
      };
    }

    case 'LOOKUP_EMAIL': {
      const { email } = message.payload;
      return await lookupEmail(email);
    }

    case 'SAVE_USER': {
      const { email, licenseType } = message.payload;
      await saveUserIdentity(email, licenseType);

      // Fetch real usage from Supabase and seed local counter
      // so sign-out/sign-in doesn't reset the attempt count
      if (licenseType !== 'beta' && licenseType !== 'pro') {
        const supabaseUsage = await fetchUsageFromSupabase(email);
        await seedAttemptState(email, supabaseUsage);
        console.log(`[Ouroboros] Usage seeded from Supabase for ${email}`);
      }

      return { ok: true };
    }
    case 'SIGN_OUT': {

      await clearAllData();
      console.log('[Ouroboros] Signed out — clean slate');
      return { ok: true };
    }

    case 'GET_CONFIG': {
      const config = await getConfig();
      return { config };
    }

    case 'OPEN_OPTIONS': {
      chrome.runtime.openOptionsPage();
      return { ok: true };
    }

    case 'OPEN_ONBOARDING': {
      const step = message.payload?.step ?? null;
      const base = chrome.runtime.getURL('onboarding/onboarding.html');
      const url  = step !== null ? `${base}?step=${step}` : base;
      chrome.tabs.create({ url });
      return { ok: true };
    }

    case 'LOG_EVENT': {
      await logEvent(message.payload);
      return { ok: true };
    }

    case 'CLEAR_LICENSE_CACHE': {
      await clearLicenseCache();
      return { ok: true };
    }

    default:
      return { error: `Unknown message type: ${message.type}` };
  }
}

// ── Supabase insert ─────────────────────────────────────────────────────────
async function supabaseInsert(table, payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: SUPABASE_HEADERS,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Supabase ${table} insert failed (${res.status}): ${err}`);
  }

  return true;
}

// ── Event logger ────────────────────────────────────────────────────────────
async function logEvent(event) {
  const config = await getConfig();
  if (!config.shareAnonymousData) return;

  const sessionId = await getSessionId();

  const entry = {
    session_id: sessionId,
    event_type: event.type || 'prompt_accepted',
    backend: config.backend || 'unknown',
    complexity: event.complexity || 'unknown',
    provenance: event.provenance || 'typed',
    inference_layer: event.inferenceLayer || 'cloud',
    original_length: event.originalLength || 0,
    improved_length: event.improvedLength || 0,
    action: event.action || 'unknown',
    time_to_decision_ms: event.timeToDecision || 0,
  };

  try {
    await supabaseInsert('ouroboros_events', entry);
    console.log('[Ouroboros] Event logged ✓');
  } catch (err) {
    console.warn('[Ouroboros] Event log failed, queuing:', err.message);
    await queueForRetry('ouroboros_events', entry);
  }
}

// ── Prompt content logger ───────────────────────────────────────────────────
async function logPromptContent(data) {
  const config = await getConfig();
  if (!config.sharePromptContent) return;

  const sessionId = await getSessionId();

  const entry = {
    session_id: sessionId,
    original_prompt: data.original || '',
    improved_prompt: data.improved || '',
    changes: data.changes || [],
    complexity: data.complexity || 'unknown',
    backend: data.backend || 'unknown',
    approved: data.approved ?? null,
  };

  try {
    await supabaseInsert('ouroboros_prompts', entry);
    console.log('[Ouroboros] Prompt content logged ✓');
  } catch (err) {
    console.warn('[Ouroboros] Prompt log failed, queuing:', err.message);
    await queueForRetry('ouroboros_prompts', entry);
  }
}

// ── Retry queue ─────────────────────────────────────────────────────────────
async function queueForRetry(table, payload) {
  const { retryQueue = [] } = await chrome.storage.local.get('retryQueue');
  retryQueue.push({
    id: crypto.randomUUID(),
    table,
    payload,
    attempts: 0,
    queuedAt: new Date().toISOString(),
  });
  const trimmed = retryQueue.slice(-100);
  await chrome.storage.local.set({ retryQueue: trimmed });
}

async function flushRetryQueue() {
  const { retryQueue = [] } = await chrome.storage.local.get('retryQueue');
  if (retryQueue.length === 0) return;

  console.log(`[Ouroboros] Flushing ${retryQueue.length} queued events`);
  const remaining = [];

  for (const item of retryQueue) {
    try {
      await supabaseInsert(item.table, item.payload);
    } catch (err) {
      item.attempts = (item.attempts || 0) + 1;
      if (item.attempts < 5) remaining.push(item);
    }
  }

  await chrome.storage.local.set({ retryQueue: remaining });
  console.log(`[Ouroboros] Flush complete. ${remaining.length} remaining.`);
}

// ── Session ID ──────────────────────────────────────────────────────────────
async function getSessionId() {
  try {
    const { sessionId } = await chrome.storage.session.get('sessionId');
    if (sessionId) return sessionId;
    const newId = crypto.randomUUID();
    await chrome.storage.session.set({ sessionId: newId });
    return newId;
  } catch {
    return crypto.randomUUID();
  }
}