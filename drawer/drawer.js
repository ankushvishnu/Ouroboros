// Ouroboros — Drawer Orchestrator v2
// 1.5-hour cooldown system, attempt counter, preventive copy blocking

import { diffWords } from '../core/diff.js';
import { getConfig, saveConfig, savePromptToLibrary, getPromptLibrary, incrementPromptUse, deletePrompt } from '../core/storage.js';
import { maskImprovedPrompt, formatCooldown } from '../core/usage.js';

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
  isTrial: false,
  attemptCount: 0,
  attemptLimit: 5,
  cooldownUntil: null,
  cooldownRemainingMs: 0,
  licenseStatus: null,
  resultAccepted: false,
  // Copy debounce
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
  startCooldownCountdown();

  window.parent.postMessage({ type: 'OUROBOROS_GET_PROMPT' }, '*');
}

// ── Cooldown countdown — adaptive tick rate ───────────────────────────────
// Ticks every second when under 5 minutes, every 30 seconds otherwise.
// Auto-unblocks the UI when cooldown expires.
let _cooldownTimer = null;

function startCooldownCountdown() {
  // Clear any existing timer before starting a new one
  if (_cooldownTimer) {
    clearTimeout(_cooldownTimer);
    _cooldownTimer = null;
  }

  function update() {
    if (!state.cooldownUntil) return;

    const remaining = Math.max(0, state.cooldownUntil - Date.now());
    state.cooldownRemainingMs = remaining;

    // Update paywall timer text
    const el = $('paywall-reset-time');
    if (el) el.textContent = formatCooldown(remaining);

    // Update usage meter
    renderUsageMeter();

    // Cooldown expired — clean up and unblock
    if (remaining === 0) {
      state.cooldownUntil = null;
      state.attemptCount = 0;
      _cooldownTimer = null;
      hidePaywall();
      renderUsageMeter();
      const btn = $('btn-optimize');
      if (btn && state.prompt?.trim()) btn.removeAttribute('disabled');
      return; // stop scheduling
    }

    // Adaptive tick: every 1s under 5 minutes, every 30s otherwise
    const nextTick = remaining <= 5 * 60 * 1000 ? 1000 : 30000;
    _cooldownTimer = setTimeout(update, nextTick);
  }

  update();
}

// ── Fetch current status from background ──────────────────────────────────
async function refreshStatus() {
  try {
    const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    state.isTrial             = !status.licenseStatus?.valid;
    state.attemptCount        = status.attemptState?.count ?? 0;
    state.cooldownUntil       = status.attemptState?.cooldownUntil ?? null;
    state.cooldownRemainingMs = status.cooldownRemainingMs ?? 0;
    state.attemptLimit        = status.attemptLimit ?? 5;
    state.licenseStatus       = status.licenseStatus;
  } catch (e) {
    console.warn('[Ouroboros] Could not fetch status:', e.message);
  }
}

// ── Message bridge ────────────────────────────────────────────────────────
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

  const flag     = $('provenance-flag');
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

  // Licensed — show badge
  if (!state.isTrial && state.licenseStatus?.valid) {
    meter.innerHTML = `<span class="usage-badge usage-badge-beta">✦ Beta — unlimited</span>`;
    return;
  }

  // Not trial (unlaunched, unconfigured) — hide meter
  if (!state.isTrial) {
    meter.innerHTML = '';
    return;
  }

  const count = state.attemptCount;
  const limit = state.attemptLimit;
  const left  = Math.max(0, limit - count);
  const pct   = Math.min(100, (count / limit) * 100);
  const inCooldown = state.cooldownUntil && Date.now() < state.cooldownUntil;

  const color = inCooldown || left === 0 ? 'var(--color-error)'
              : left === 1               ? 'var(--color-warning)'
              : 'var(--color-accent)';

  const label = inCooldown
    ? `Cooldown — available in ${formatCooldown(state.cooldownRemainingMs)}`
    : left === 0
      ? 'Limit reached'
      : `${left} improvement${left !== 1 ? 's' : ''} left`;

  meter.innerHTML = `
    <div class="usage-row">
      <span class="usage-label">${label}</span>
      <span class="usage-count" style="color:${color}">${count} / ${limit}</span>
    </div>
    <div class="usage-track">
      <div class="usage-fill" style="width:${pct}%; background:${color}"></div>
    </div>`;
}

// ── Paywall ───────────────────────────────────────────────────────────────
function showPaywall() {
  // Update the reset time text before showing
  const el = $('paywall-reset-time');
  if (el) el.textContent = formatCooldown(state.cooldownRemainingMs);

  $('paywall')?.classList.remove('hidden');
  $('result-area')?.classList.add('hidden');
  $('btn-optimize')?.setAttribute('disabled', 'true');
}

function hidePaywall() {
  $('paywall')?.classList.add('hidden');
}

// ── Optimize ──────────────────────────────────────────────────────────────
async function optimize() {
  if (!state.prompt?.trim() || state.loading) return;

  await refreshStatus();

  // Hard block if in cooldown
  if (state.isTrial && state.cooldownUntil && Date.now() < state.cooldownUntil) {
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
      state.cooldownUntil      = response.cooldownUntil;
      state.cooldownRemainingMs = response.cooldownRemainingMs;
      state.attemptCount       = response.count;
      renderUsageMeter();
      showPaywall();
      return;
    }

    if (response.error) throw new Error(response.error);

    state.result = response.result;

    // Sync attempt count from result
    if (response.result.attemptCount !== null && response.result.attemptCount !== undefined) {
      state.attemptCount = response.result.attemptCount;
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

  const improvedText = result.improved || result.original;

  // Block selection and copy for all trial users on every attempt.
  // "Use this" is the only path to get the improved text into the prompt field.
  // Covers: mouse selection (user-select), keyboard (copy event), right-click (contextmenu).
  const isTrial = state.isTrial;

  // Edit tab — hidden for trial users, visible for beta/pro
  const editTabBtn = document.querySelector('.result-tab[data-result-tab="edit"]');
  const editTabPanel = $('rv-edit');
  if (editTabBtn)   editTabBtn.style.display   = isTrial ? 'none' : '';
  if (editTabPanel) editTabPanel.style.display = isTrial ? 'none' : '';

  // If trial user somehow has edit tab active, switch back to improved
  if (isTrial && state.currentResultTab === 'edit') {
    state.currentResultTab = 'improved';
    document.querySelectorAll('.result-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.result-view').forEach(v => v.classList.remove('active'));
    document.querySelector('.result-tab[data-result-tab="improved"]')?.classList.add('active');
    $('rv-improved')?.classList.add('active');
  }
  const resultArea = $('result-area');
  if (resultArea) {
    resultArea.removeEventListener('copy', resultArea._copyBlocker);
    if (isTrial) {
      resultArea._copyBlocker = (e) => e.preventDefault();
      resultArea.addEventListener('copy', resultArea._copyBlocker);
    } else {
      resultArea._copyBlocker = null;
    }
  }

  // Improved view
  const improved = $('improved-text');
  if (improved) {
    improved.textContent = improvedText;
    improved.style.userSelect = isTrial ? 'none' : '';
    improved.style.webkitUserSelect = isTrial ? 'none' : '';
    if (isTrial) {
      improved.addEventListener('contextmenu', (e) => e.preventDefault(), false);
    }
  }

  // Diff view
  const diffEl = $('diff-text');
  if (diffEl) {
    const tokens = diffWords(result.original, improvedText);
    diffEl.innerHTML = tokens.map(token => {
      const cls = token.type === 'add'    ? 'diff-add'
                : token.type === 'remove' ? 'diff-remove'
                : 'diff-same';
      return `<span class="${cls}">${escapeHtml(token.text)}</span>`;
    }).join('');
    diffEl.style.userSelect = isTrial ? 'none' : '';
    diffEl.style.webkitUserSelect = isTrial ? 'none' : '';
  }

  // Edit view — only rendered for licensed users (tab hidden for trial)
  const editArea = $('edit-textarea');
  if (editArea) {
    editArea.value    = improvedText;
    editArea.readOnly = false;
    editArea.style.opacity = '';
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

  // Apply button
  const applyBtn = $('btn-apply');
  if (applyBtn) {
    applyBtn.textContent = result.changes?.length === 0 ? '✓ Send as-is' : '✓ Use this';
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

  // "Use this" counts as an attempt — only once per result
  if (!useOriginal && !state.resultAccepted) {
    state.resultAccepted = true;

    const countResponse = await chrome.runtime.sendMessage({
      type: 'ACCEPT_IMPROVEMENT',
      payload: {
        complexity:    state.result?.complexity,
        provenance:    state.provenance,
        originalLength: state.result?.original?.length || 0,
        improvedLength: promptToApply.length,
        timeToDecision: state.startTime ? Date.now() - state.startTime : 0,
        inferenceLayer: state.result?.inferenceLayer || 'cloud',
      }
    });

    if (countResponse?.attemptState) {
      state.attemptCount  = countResponse.attemptState.count;
      state.cooldownUntil = countResponse.attemptState.cooldownUntil;
      state.cooldownRemainingMs = countResponse.attemptState.cooldownUntil
        ? Math.max(0, countResponse.attemptState.cooldownUntil - Date.now())
        : 0;
    }

    renderUsageMeter();

    // Show paywall after applying if cooldown just triggered
    if (countResponse?.attemptState?.justTriggeredCooldown) {
      setTimeout(showPaywall, 400);
    }
  }

  window.parent.postMessage({
    type: 'OUROBOROS_APPLY_PROMPT',
    payload: { prompt: promptToApply }
  }, '*');

  chrome.runtime.sendMessage({
    type: 'LOG_EVENT',
    payload: {
      type: useOriginal ? 'prompt_original_used' : 'prompt_accepted',
      action: useOriginal ? 'approved_original' : 'approved_optimized',
      originalLength: state.result?.original?.length || 0,
      improvedLength: promptToApply.length,
      complexity:    state.result?.complexity,
      provenance:    state.provenance,
      inferenceLayer: state.result?.inferenceLayer || 'cloud',
      timeToDecision: state.startTime ? Date.now() - state.startTime : 0,
    }
  });
}

async function saveToLibrary() {
  if (!state.result) return;

  await savePromptToLibrary({
    original:   state.result.original,
    improved:   state.result.improved,
    changes:    state.result.changes,
    complexity: state.result.complexity,
  });

  const btn = $('btn-save');
  if (btn) {
    btn.textContent = '✓ Saved';
    btn.disabled = true;
    setTimeout(() => { btn.textContent = 'Save to library'; btn.disabled = false; }, 2000);
  }

  await renderLibrary();
}

// ── Library ───────────────────────────────────────────────────────────────
async function renderLibrary(filter = '') {
  const list = $('library-list');
  if (!list) return;

  const prompts  = await getPromptLibrary();
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
          <button class="lib-btn" data-action="use" data-id="${p.id}">Use</button>
          <button class="lib-btn lib-btn-delete" data-action="delete" data-id="${p.id}">✕</button>
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
          window.parent.postMessage({ type: 'OUROBOROS_APPLY_PROMPT', payload: { prompt: prompt.improved } }, '*');
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

  const inCooldown = state.cooldownUntil && Date.now() < state.cooldownUntil;

  const email       = state.licenseStatus?.email || state.config?.userEmail || null;
  const tier        = state.licenseStatus?.licenseType || 'none';
  const tierLabels  = { beta: '✦ Beta', trial: 'Trial', pro: '✦ Pro', none: 'Free trial' };
  const tierLabel   = tierLabels[tier] || 'Free trial';

  const accountSection = email
    ? `<div class="settings-label">Account</div>
       <div class="settings-value" style="word-break:break-all">${email}</div>
       <div class="settings-value" style="margin-top:4px;font-size:11px;color:var(--color-text-dim)">${tierLabel}${inCooldown ? ` · Cooldown: ${formatCooldown(state.cooldownRemainingMs)}` : state.isTrial ? ` · ${state.attemptCount}/${state.attemptLimit} used` : ' · Unlimited'}</div>`
    : `<div class="settings-label">Account</div>
       <div class="settings-value" style="color:var(--color-text-dim)">Not signed in — free trial</div>`;

  container.innerHTML = `
    <div class="settings-section">
      ${accountSection}
      <button class="settings-btn" id="btn-reconfig" style="margin-top:10px">Change setup</button>
      ${email ? `<button class="settings-btn" id="btn-sign-out" style="margin-top:6px">Sign out</button>` : ''}
    </div>
    <div class="settings-section">
      <div class="settings-label">Backend</div>
      <div class="settings-value">${state.config.backend || 'Not configured'}</div>
    </div>
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
    // Always land on Step 0 so user can re-enter email first
    chrome.runtime.sendMessage({ type: 'OPEN_ONBOARDING', payload: { step: 0 } });
  });

  $('btn-sign-out')?.addEventListener('click', async () => {
    if (confirm('Sign out? You\'ll revert to the free trial.')) {
      await chrome.runtime.sendMessage({ type: 'SIGN_OUT' });
      // Update local state immediately
      state.licenseStatus = { valid: false, licenseType: 'free', email: null };
      state.isTrial = true;
      renderSettings();
      renderUsageMeter();
      // Open onboarding at Step 0 so user can sign in with a different account
      chrome.runtime.sendMessage({ type: 'OPEN_ONBOARDING', payload: { step: 0 } });
    }
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

// ── Tabs ──────────────────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      $(`view-${tab}`)?.classList.add('active');
      if (tab === 'library')  renderLibrary();
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

// ── Buttons ───────────────────────────────────────────────────────────────
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
  if (icon)  icon.classList.toggle('spinning', loading);
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