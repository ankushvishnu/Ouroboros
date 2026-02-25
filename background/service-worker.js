// Ouroboros — Background Service Worker
// Handles: LLM API calls, complexity routing, storage events, tab lifecycle

import { route } from '../core/router.js';
import { getConfig } from '../core/storage.js';

// ── Install / First Launch ──────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // First install — open onboarding
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
  }

  if (details.reason === 'update') {
    // Future: handle migration between versions
    console.log('[Ouroboros] Updated to', chrome.runtime.getManifest().version);
  }
});

// ── Message Router ──────────────────────────────────────────────────────────
// All messages from content scripts and drawer pass through here
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((err) => {
      console.error('[Ouroboros] Message handler error:', err);
      sendResponse({ error: err.message || 'Unknown error' });
    });

  // Return true to keep the message channel open for async response
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

      const result = await route({ prompt, provenance, config });
      return { result };
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
      chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
      return { ok: true };
    }

    case 'LOG_EVENT': {
      // Beta: store locally. Enterprise (Phase 1.1): forward to Azure Monitor
      await logEvent(message.payload);
      return { ok: true };
    }

    default:
      return { error: `Unknown message type: ${message.type}` };
  }
}

// ── Local Event Logger (Beta) ───────────────────────────────────────────────
async function logEvent(event) {
  const config = await getConfig();

  // Respect user's data sharing preference
  if (!config.shareAnonymousData) return;

  const entry = {
    event_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    session_id: await getSessionId(),
    event_type: event.type,
    prompt_metadata: {
      original_length: event.originalLength || 0,
      improved_length: event.improvedLength || 0,
      complexity: event.complexity || 'unknown',
      provenance: event.provenance || 'typed',
      inference_layer: event.inferenceLayer || 'cloud',
    },
    decision: {
      action: event.action || 'unknown',
      time_to_decision_ms: event.timeToDecision || 0,
    },
    // Never log prompt content — only metadata
  };

  // Store locally for now
  const { auditLog = [] } = await chrome.storage.local.get('auditLog');
  auditLog.unshift(entry);

  // Keep last 500 entries locally
  const trimmed = auditLog.slice(0, 500);
  await chrome.storage.local.set({ auditLog: trimmed });
}

// ── Session ID ──────────────────────────────────────────────────────────────
async function getSessionId() {
  const { sessionId } = await chrome.storage.session.get('sessionId');
  if (sessionId) return sessionId;

  const newId = crypto.randomUUID();
  await chrome.storage.session.set({ sessionId: newId });
  return newId;
}
