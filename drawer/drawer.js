// Ouroboros — Drawer Orchestrator v2
// Usage meter, hard block UI, copy/paste protection, license-aware rendering

import { diffWords } from '../core/diff.js';
import { getConfig, saveConfig, savePromptToLibrary, getPromptLibrary, incrementPromptUse, deletePrompt } from '../core/storage.js';
import { maskImprovedPrompt } from '../core/usage.js';

// ── State ─────────────────────────────────────────────────────────────────
let state = {
  prompt: '',
  provenance: 'typed',
  platform: 'generic',
  result: null,
  loading: false,
  currentResultTab: 'improved',
  config: null,
  startTime: null,
  // Usage / license state (fetched on init)
  isTrial: false,
  todayUsage: 0,
  dailyLimit: 5,
  launched: false,
  licenseStatus: null,
  // Whether this result has been accepted already (prevents double-count)
  resultAccepted: false,
};

const $ = (id) => document.getElementById(id);

// ── Init ──────────────────────────────────────────────────────────────────
async function init() {
  state.config = await getConfig();
  await refreshStatus();
  setupTabs();
  setupResultTabs();
  setupButtons();
  setupLibrary();
  setupSettings();
  renderSettings();
  renderUsageMeter();
  startResetCountdown();

  window.parent.postMessage({ type: 'OUROBOROS_GET_PROMPT' }, '*');
}

// ── Paywall reset countdown ───────────────────────────────────────────────
function startResetCountdown() {
  function update() {
    const el = $('paywall-reset-time');
    if (!el) return;
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    const diff = midnight - now;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    el.textContent = `${h}h ${m}m`;
  }
  update();
  setInterval(update, 60000);
}

// ── Fetch current usage / license status from background ─────────────────
async function refreshStatus() {
  try {
    const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    state.isTrial    = status.isTrial;
    state.todayUsage = status.todayUsage || 0;
    state.dailyLimit = status.dailyLimit || 5;
    state.launched   = status.launched;
    state.licenseStatus = status.licenseStatus;
  } catch (e) {
    console.warn('[Ouroboros] Could not fetch status:', e.message);
  }
}

// ── Message bridge (iframe ↔ content script) ──────────────────────────────
window.addEventListener('message', (e) => {
  if (!e.data?.type?.startsWith('OUROBOROS_')) return;
  switch (e.data.type) {
    case 'OUROBOROS_CONTEXT': {
      const { prompt, provenance, platform } = e.data.payload;
      updateContext(prompt, provenance, platform);
      break;
    }
  }
});

function updateContext(prompt, provenance, platform) {
  state.prompt = prompt;
  state.provenance = provenance;
  state.platform = platform;
  state.result = null;
  state.resultAccepted = false;

  const badge = $('platform-badge');
  if (badge) badge.textContent = platform !== 'generic' ? platform : '—';

  const flag = $('provenance-flag');
  const flagText = $('provenance-text');
  if (flag && flagText) {
    if (provenance === 'pasted' || provenance === 'mixed' || provenance === 'auto-populated') {
      flag.classList.remove('hidden');
      flagText.textContent = provenance === 'auto-populated'
        ? 'Auto-populated content — review before sending'
        : 'Contains pasted content — review before sending';
    } else {
      flag.classList.add('hidden');
    }
  }

  const previewText = $('preview-text');
  if (previewText) {
    previewText.textContent = prompt || 'Focus a text field on the page to begin.';
  }

  const btn = $('btn-optimize');
  if (btn) {
    btn.disabled = !prompt || !prompt.trim() || !state.config?.configured;
  }

  hideResult();
  hidePaywall();
}

// ── Usage meter ───────────────────────────────────────────────────────────
function renderUsageMeter() {
  const meter = $('usage-meter');
  if (!meter) return;

  // Licensed users: show beta badge instead of meter
  if (!state.isTrial) {
    if (state.licenseStatus?.valid) {
      meter.innerHTML = `
        <span class="usage-badge usage-badge-beta">
          ✦ Beta — unlimited
        </span>`;
    } else if (!state.launched) {
      meter.innerHTML = `
        <span class="usage-badge usage-badge-beta">
          ✦ Open beta
        </span>`;
    } else {
      meter.innerHTML = '';
    }
    return;
  }

  const used  = state.todayUsage;
  const limit = state.dailyLimit;
  const left  = Math.max(0, limit - used);
  const pct   = Math.min(100, (used / limit) * 100);

  const color = left === 0   ? 'var(--color-error)'
              : left === 1   ? 'var(--color-warning)'
              : 'var(--color-accent)';

  meter.innerHTML = `
    <div class="usage-row">
      <span class="usage-label">${left === 0 ? 'Daily limit reached' : `${left} improvement${left !== 1 ? 's' : ''} left today`}</span>
      <span class="usage-count" style="color:${color}">${used} / ${limit}</span>
    </div>
    <div class="usage-track">
      <div class="usage-fill" style="width:${pct}%; background:${color}"></div>
    </div>`;
}

// ── Paywall ───────────────────────────────────────────────────────────────
function showPaywall() {
  const pw = $('paywall');
  if (pw) pw.classList.remove('hidden');
  $('result-area')?.classList.add('hidden');
  $('btn-optimize')?.setAttribute('disabled', 'true');
}

function hidePaywall() {
  $('paywall')?.classList.add('hidden');
}

// ── Optimize ──────────────────────────────────────────────────────────────
async function optimize() {
  if (!state.prompt?.trim() || state.loading) return;

  // Refresh status before each optimization
  await refreshStatus();

  // Hard block if limit reached
  if (state.isTrial && state.todayUsage >= state.dailyLimit) {
    showPaywall();
    return;
  }

  state.loading = true;
  state.startTime = Date.now();
  state.resultAccepted = false;
  setOptimizeButtonLoading(true);
  hideResult();
  hidePaywall();

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'OPTIMIZE_PROMPT',
      payload: { prompt: state.prompt, provenance: state.provenance },
    });

    if (response.error === 'NOT_CONFIGURED') {
      chrome.runtime.sendMessage({ type: 'OPEN_ONBOARDING' });
      return;
    }

    if (response.error === 'DAILY_LIMIT_REACHED') {
      state.todayUsage = state.dailyLimit;
      renderUsageMeter();
      showPaywall();
      return;
    }

    if (response.error) throw new Error(response.error);

    state.result = response.result;

    // Update local usage state from result
    if (response.result.usageAfterThis !== null) {
      // usageAfterThis is what it WILL be after accept — show current
      state.todayUsage = Math.max(0, response.result.usageAfterThis - 1);
    }

    renderResult(state.result);
    showResult();
    renderUsageMeter();

  } catch (err) {
    console.error('[Ouroboros] Optimize error:', err);
    showError(err.message);
  } finally {
    state.loading = false;
    setOptimizeButtonLoading(false);
  }
}

// ── Render result ─────────────────────────────────────────────────────────
function renderResult(result) {
  const colors = { none: '#4ade80', low: '#a3e635', medium: '#facc15', high: '#f97316', unknown: '#888' };

  const badge = $('complexity-badge');
  if (badge) {
    badge.textContent = result.complexity || 'unknown';
    badge.style.color = colors[result.complexity] || '#888';
    badge.style.borderColor = `${colors[result.complexity]}44`;
  }

  const count = $('changes-count');
  if (count) {
    count.textContent = result.changes?.length
      ? `${result.changes.length} change${result.changes.length !== 1 ? 's' : ''}`
      : 'no changes';
  }

  // If trial and this would be the last use — show masked version
  const isLastUse = state.isTrial && (state.todayUsage + 1 >= state.dailyLimit);
  const improvedText = result.improved || result.original;

  // Improved view
  const improved = $('improved-text');
  if (improved) {
    if (isLastUse) {
      // Last free use — show full text but disable copy
      improved.textContent = improvedText;
      improved.style.userSelect = 'none';
      improved.style.webkitUserSelect = 'none';
      improved.addEventListener('copy', (e) => e.preventDefault(), { once: false });
      improved.addEventListener('contextmenu', (e) => e.preventDefault(), { once: false });
    } else {
      improved.textContent = improvedText;
      improved.style.userSelect = '';
      improved.style.webkitUserSelect = '';
    }
  }

  // Diff view — never masked (structural info only, not copyable prompt)
  const diffEl = $('diff-text');
  if (diffEl) {
    const tokens = diffWords(result.original, improvedText);
    diffEl.innerHTML = tokens.map(token => {
      const cls = token.type === 'add' ? 'diff-add'
        : token.type === 'remove' ? 'diff-remove'
        : 'diff-same';
      return `<span class="${cls}">${escapeHtml(token.text)}</span>`;
    }).join('');
    if (isLastUse) {
      diffEl.style.userSelect = 'none';
      diffEl.style.webkitUserSelect = 'none';
    }
  }

  // Edit view — disabled on last free use
  const editArea = $('edit-textarea');
  if (editArea) {
    editArea.value = improvedText;
    editArea.readOnly = isLastUse;
    if (isLastUse) {
      editArea.style.opacity = '0.5';
      editArea.title = 'Editing disabled on last free use — upgrade for full access';
    } else {
      editArea.style.opacity = '';
      editArea.title = '';
    }
  }

  // Changes list
  const changesList = $('changes-list');
  if (changesList) {
    if (result.changes?.length) {
      changesList.innerHTML = result.changes.map(c =>
        `<li class="change-item"><span class="change-plus">+</span>${escapeHtml(c)}</li>`
      ).join('');
      changesList.classList.remove('hidden');
    } else {
      changesList.classList.add('hidden');
    }
  }

  // Reasoning
  const reasoning = $('reasoning-text');
  if (reasoning && result.reasoning) {
    reasoning.textContent = `⟳ ${result.reasoning}`;
    reasoning.classList.remove('hidden');
  } else if (reasoning) {
    reasoning.classList.add('hidden');
  }

  // Apply button label
  const applyBtn = $('btn-apply');
  if (applyBtn) {
    applyBtn.textContent = result.changes?.length === 0 ? '✓ Send as-is' : '✓ Use this';
  }

  // Show last-use warning if applicable
  const lastUseWarning = $('last-use-warning');
  if (lastUseWarning) {
    if (isLastUse) {
      lastUseWarning.classList.remove('hidden');
    } else {
      lastUseWarning.classList.add('hidden');
    }
  }
}

// ── Approval actions ──────────────────────────────────────────────────────
async function applyPrompt(useOriginal = false) {
  const promptToApply = useOriginal
    ? state.result?.original
    : state.currentResultTab === 'edit'
      ? $('edit-textarea')?.value
      : state.result?.improved;

  if (!promptToApply) return;

  // Prevent double-counting if user clicks "Use this" twice
  if (!useOriginal && !state.resultAccepted) {
    state.resultAccepted = true;

    // Tell background to increment usage count
    const countResponse = await chrome.runtime.sendMessage({
      type: 'ACCEPT_IMPROVEMENT',
      payload: {
        complexity: state.result?.complexity,
        provenance: state.provenance,
        originalLength: state.result?.original?.length || 0,
        improvedLength: promptToApply.length,
        timeToDecision: state.startTime ? Date.now() - state.startTime : 0,
        inferenceLayer: state.result?.inferenceLayer || 'cloud',
      }
    });

    // Update local count and re-render meter
    if (countResponse?.newCount !== null && countResponse?.newCount !== undefined) {
      state.todayUsage = countResponse.newCount;
    }

    renderUsageMeter();

    // If this was the last free use, show paywall after applying
    if (state.isTrial && state.todayUsage >= state.dailyLimit) {
      setTimeout(showPaywall, 300);
    }
  }

  window.parent.postMessage({
    type: 'OUROBOROS_APPLY_PROMPT',
    payload: { prompt: promptToApply }
  }, '*');

  // Also log for analytics (non-counting)
  chrome.runtime.sendMessage({
    type: 'LOG_EVENT',
    payload: {
      type: useOriginal ? 'prompt_original_used' : 'prompt_accepted',
      action: useOriginal ? 'approved_original' : 'approved_optimized',
      originalLength: state.result?.original?.length || 0,
      improvedLength: promptToApply.length,
      complexity: state.result?.complexity,
      provenance: state.provenance,
      inferenceLayer: state.result?.inferenceLayer || 'cloud',
      timeToDecision: state.startTime ? Date.now() - state.startTime : 0,
    }
  });
}

async function saveToLibrary() {
  if (!state.result) return;

  await savePromptToLibrary({
    original: state.result.original,
    improved: state.result.improved,
    changes: state.result.changes,
    complexity: state.result.complexity,
  });

  const btn = $('btn-save');
  if (btn) {
    btn.textContent = '✓ Saved';
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = 'Save to library';
      btn.disabled = false;
    }, 2000);
  }

  await renderLibrary();
}

// ── Library ───────────────────────────────────────────────────────────────
async function renderLibrary(filter = '') {
  const list = $('library-list');
  if (!list) return;

  const prompts = await getPromptLibrary();
  const filtered = filter
    ? prompts.filter(p =>
        p.title?.toLowerCase().includes(filter.toLowerCase()) ||
        p.improved?.toLowerCase().includes(filter.toLowerCase())
      )
    : prompts;

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state"><p>${filter ? 'No results.' : 'No saved prompts yet.<br>Approve an optimization and save it.'}</p></div>`;
    return;
  }

  list.innerHTML = filtered.map(p => `
    <div class="library-item" data-id="${p.id}">
      <div class="library-item-header">
        <span class="library-item-title">${escapeHtml(p.title || 'Untitled')}</span>
        <div class="library-item-actions">
          <button class="lib-btn" data-action="use" data-id="${p.id}" title="Use this prompt">Use</button>
          <button class="lib-btn lib-btn-delete" data-action="delete" data-id="${p.id}" title="Delete">✕</button>
        </div>
      </div>
      <div class="library-item-preview">${escapeHtml(p.improved?.slice(0, 100))}${p.improved?.length > 100 ? '...' : ''}</div>
      <div class="library-item-meta">
        <span class="complexity-badge" style="font-size:10px">${p.complexity || '—'}</span>
        <span>${p.useCount || 0} uses</span>
        <span>${new Date(p.timestamp).toLocaleDateString()}</span>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const { action, id } = btn.dataset;

      if (action === 'use') {
        await incrementPromptUse(id);
        const prompt = filtered.find(p => p.id === id);
        if (prompt) {
          window.parent.postMessage({
            type: 'OUROBOROS_APPLY_PROMPT',
            payload: { prompt: prompt.improved }
          }, '*');
        }
      }

      if (action === 'delete') {
        await deletePrompt(id);
        await renderLibrary(filter);
      }
    });
  });
}

function setupLibrary() {
  const search = $('library-search');
  if (search) search.addEventListener('input', () => renderLibrary(search.value));
}

// ── Settings ──────────────────────────────────────────────────────────────
function renderSettings() {
  const container = $('settings-content');
  if (!container || !state.config) return;

  const licenseInfo = state.licenseStatus?.valid
    ? `<div class="settings-license-badge">✦ Beta — unlimited until ${new Date(state.licenseStatus.validUntil).toLocaleDateString()}</div>`
    : state.isTrial
      ? `<div class="settings-license-free">${state.todayUsage} / ${state.dailyLimit} used today · <a href="https://papercargo.com/ouroboros#pricing" target="_blank">Upgrade →</a></div>`
      : '';

  container.innerHTML = `
    <div class="settings-section">
      <div class="settings-label">Backend</div>
      <div class="settings-value">${state.config.backend || 'Not configured'}</div>
      <button class="settings-btn" id="btn-reconfig">Change setup</button>
    </div>
    ${licenseInfo ? `<div class="settings-section">${licenseInfo}</div>` : ''}
    <div class="settings-section">
      <label class="settings-toggle-row">
        <span>Share anonymous usage data</span>
        <input type="checkbox" id="toggle-share" ${state.config.shareAnonymousData ? 'checked' : ''}>
      </label>
      <label class="settings-toggle-row">
        <span>Share prompt content for training</span>
        <input type="checkbox" id="toggle-share-prompts" ${state.config.sharePromptContent ? 'checked' : ''}>
      </label>
    </div>
    <div class="settings-section">
      <button class="settings-btn settings-btn-danger" id="btn-clear-data">Clear all data & reconfigure</button>
    </div>
    <div class="settings-note">
      Your API key and prompt content are never logged without consent.
      <a href="https://papercargo.com/privacy" target="_blank">Privacy policy →</a>
    </div>
  `;

  $('btn-reconfig')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_ONBOARDING' });
  });

  $('btn-clear-data')?.addEventListener('click', async () => {
    if (confirm('This will clear your API key, settings, and prompt library. Continue?')) {
      await chrome.storage.sync.clear();
      await chrome.storage.local.clear();
      chrome.runtime.sendMessage({ type: 'OPEN_ONBOARDING' });
    }
  });

  ['share', 'share-prompts'].forEach(key => {
    const el = $(`toggle-${key}`);
    const configKey = { 'share': 'shareAnonymousData', 'share-prompts': 'sharePromptContent' }[key];
    el?.addEventListener('change', async () => {
      await saveConfig({ [configKey]: el.checked });
      state.config = await getConfig();
    });
  });
}

function setupSettings() {}

// ── Tab navigation ────────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      $(`view-${tab}`)?.classList.add('active');

      if (tab === 'library') renderLibrary();
      if (tab === 'settings') renderSettings();
    });
  });
}

function setupResultTabs() {
  document.querySelectorAll('.result-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.resultTab;
      state.currentResultTab = tab;
      document.querySelectorAll('.result-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.result-view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      $(`rv-${tab}`)?.classList.add('active');
    });
  });
}

// ── Button setup ──────────────────────────────────────────────────────────
function setupButtons() {
  $('btn-optimize')?.addEventListener('click', optimize);
  $('btn-apply')?.addEventListener('click', () => applyPrompt(false));
  $('btn-use-original')?.addEventListener('click', () => applyPrompt(true));
  $('btn-save')?.addEventListener('click', saveToLibrary);
  $('btn-close')?.addEventListener('click', () => {
    window.parent.postMessage({ type: 'OUROBOROS_CLOSE_DRAWER' }, '*');
  });
  $('btn-reload')?.addEventListener('click', () => {
    window.parent.postMessage({ type: 'OUROBOROS_RESET_PAGE' }, '*');
  });
  // Paywall upgrade CTA
  $('btn-upgrade')?.addEventListener('click', () => {
    window.open('https://papercargo.com/ouroboros#pricing', '_blank');
  });
}

// ── UI helpers ────────────────────────────────────────────────────────────
function showResult() {
  $('result-area')?.classList.remove('hidden');
  $('empty-state')?.classList.add('hidden');
  $('prompt-preview')?.classList.add('hidden');
}

function hideResult() {
  $('result-area')?.classList.add('hidden');
}

function setOptimizeButtonLoading(loading) {
  const btn   = $('btn-optimize');
  const label = $('btn-optimize-label');
  const icon  = btn?.querySelector('.btn-icon');
  if (!btn) return;
  btn.disabled = loading;
  if (label) label.textContent = loading ? 'Improving...' : 'Improve prompt';
  if (icon) icon.classList.toggle('spinning', loading);
}

function showError(message) {
  const preview = $('preview-text');
  if (preview) {
    preview.innerHTML = `<span style="color:var(--color-error)">Error: ${escapeHtml(message)}</span>`;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Start ─────────────────────────────────────────────────────────────────
init();
