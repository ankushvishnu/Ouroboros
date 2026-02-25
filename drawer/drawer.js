// Ouroboros — Drawer Orchestrator
// Manages all drawer state, views, and communication with background

import { diffWords } from '../core/diff.js';
import { getConfig, saveConfig, savePromptToLibrary, getPromptLibrary, incrementPromptUse, deletePrompt } from '../core/storage.js';

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
};

// ── DOM refs ──────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// ── Init ──────────────────────────────────────────────────────────────────
async function init() {
  state.config = await getConfig();
  setupTabs();
  setupResultTabs();
  setupButtons();
  setupLibrary();
  setupSettings();
  renderSettings();

  // Tell parent page we're ready and want context
  window.parent.postMessage({ type: 'OUROBOROS_GET_PROMPT' }, '*');
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

  // Platform badge
  const badge = $('platform-badge');
  if (badge) badge.textContent = platform !== 'generic' ? platform : '—';

  // Provenance flag
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

  // Preview
  const previewText = $('preview-text');
  if (previewText) {
    previewText.textContent = prompt || 'Focus a text field on the page to begin.';
  }

  // Enable/disable optimize button
  const btn = $('btn-optimize');
  if (btn) {
    btn.disabled = !prompt || !prompt.trim() || !state.config?.configured;
  }

  // Reset result area
  hideResult();
}

// ── Optimize ──────────────────────────────────────────────────────────────
async function optimize() {
  if (!state.prompt?.trim() || state.loading) return;

  state.loading = true;
  state.startTime = Date.now();
  setOptimizeButtonLoading(true);
  hideResult();

  // Before sending message, check context is still valid
  if (!chrome.runtime?.id) {
    showError('Extension was updated — please reload this page.');
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'OPTIMIZE_PROMPT',
      payload: {
        prompt: state.prompt,
        provenance: state.provenance,
      },
    });

    if (response.error === 'NOT_CONFIGURED') {
      chrome.runtime.sendMessage({ type: 'OPEN_ONBOARDING' });
      return;
    }

    if (response.error) throw new Error(response.error);

    state.result = response.result;
    renderResult(state.result);
    showResult();

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
  // Complexity badge
  const badge = $('complexity-badge');
  const colors = { none: '#4ade80', low: '#a3e635', medium: '#facc15', high: '#f97316', unknown: '#888' };
  if (badge) {
    badge.textContent = result.complexity || 'unknown';
    badge.style.color = colors[result.complexity] || '#888';
    badge.style.borderColor = `${colors[result.complexity]}44` || '#88844';
  }

  // Changes count
  const count = $('changes-count');
  if (count) {
    count.textContent = result.changes?.length
      ? `${result.changes.length} change${result.changes.length !== 1 ? 's' : ''}`
      : 'no changes';
  }

  // Improved text
  const improved = $('improved-text');
  if (improved) improved.textContent = result.improved || result.original;

  // Diff
  const diffEl = $('diff-text');
  if (diffEl) {
    const tokens = diffWords(result.original, result.improved);
    diffEl.innerHTML = tokens.map(token => {
      const cls = token.type === 'add' ? 'diff-add'
        : token.type === 'remove' ? 'diff-remove'
        : 'diff-same';
      return `<span class="${cls}">${escapeHtml(token.text)}</span>`;
    }).join('');
  }

  // Edit textarea
  const editArea = $('edit-textarea');
  if (editArea) editArea.value = result.improved || result.original;

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
    applyBtn.textContent = result.changes?.length === 0
      ? '✓ Send as-is'
      : '✓ Use this';
  }
}

// ── Approval actions ──────────────────────────────────────────────────────
function applyPrompt(useOriginal = false) {
  const promptToApply = useOriginal
    ? state.result?.original
    : state.currentResultTab === 'edit'
      ? $('edit-textarea')?.value
      : state.result?.improved;

  if (!promptToApply) return;

  // Send to parent page
  window.parent.postMessage({
    type: 'OUROBOROS_APPLY_PROMPT',
    payload: { prompt: promptToApply }
  }, '*');

  // Log the decision
  const timeToDecision = state.startTime ? Date.now() - state.startTime : 0;
  chrome.runtime.sendMessage({
    type: 'LOG_EVENT',
    payload: {
      type: 'prompt_approved',
      action: useOriginal ? 'approved_original' : 'approved_optimized',
      originalLength: state.result?.original?.length || 0,
      improvedLength: promptToApply.length,
      complexity: state.result?.complexity,
      provenance: state.provenance,
      inferenceLayer: state.result?.inferenceLayer || 'cloud',
      timeToDecision,
    }
  });
}

async function saveToLibrary() {
  if (!state.result) return;

  const entry = await savePromptToLibrary({
    original: state.result.original,
    improved: state.result.improved,
    changes: state.result.changes,
    complexity: state.result.complexity,
  });

  // Visual feedback
  const btn = $('btn-save');
  if (btn) {
    btn.textContent = '✓ Saved';
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = 'Save to library';
      btn.disabled = false;
    }, 2000);
  }

  // Refresh library if it's visible
  await renderLibrary();
}

// ── Library ───────────────────────────────────────────────────────────────
async function renderLibrary(filter = '') {
  const list = $('library-list');
  if (!list) return;

  // Guard — chrome may not be available if context invalidated
  if (typeof chrome === 'undefined' || !chrome.storage) {
    list.innerHTML = `<div class="empty-state"><p>Reload the page to reconnect.</p></div>`;
    return;
  }

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

  // Attach events
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
  if (search) {
    search.addEventListener('input', () => renderLibrary(search.value));
  }
}

// ── Settings ──────────────────────────────────────────────────────────────
function renderSettings() {
  const container = $('settings-content');
  if (!container || !state.config) return;

  container.innerHTML = `
  <div class="settings-section">
    <label class="settings-toggle-row">
      <span>Auto-analyze as I type</span>
      <input type="checkbox" id="toggle-auto" ${state.config.autoAnalyze ? 'checked' : ''}>
    </label>
    <label class="settings-toggle-row">
      <span>Share anonymous usage data</span>
      <input type="checkbox" id="toggle-share" ${state.config.shareAnonymousData ? 'checked' : ''}>
    </label>
    <div class="settings-toggle-row" style="margin-top: 4px">
      <span>Stuck? Reset the page</span>
      <button class="settings-btn" id="btn-soft-reload" style="padding: 3px 10px">
        ↺ Reload
      </button>
    </div>
  </div>

  <div class="settings-section">
    <div class="settings-label">Page</div>
    <button class="settings-btn" id="btn-reset-page">
      ↺ Reset & reload page
    </button>
    <div class="settings-note" style="margin-top: 6px">
      Clears provenance state and reloads the current page.
      Use this if the pasted content flag is stuck.
    </div>
  </div>

  <div class="settings-section" style="border-bottom: none">
    <div class="settings-label">Extension</div>
    <button class="settings-btn" id="btn-clear-storage" style="color: var(--color-error); border-color: rgba(248,113,113,0.2)">
      ✕ Clear all data & reconfigure
    </button>
    <div class="settings-note" style="margin-top: 6px">
      Wipes all saved config, API keys, and prompt library.
      Cannot be undone.
    </div>
  </div>

  <div class="settings-note">
    Your API key and prompt content are never logged or shared.
    <a href="https://ouroboros.dev/privacy" target="_blank">Privacy policy</a>
  </div>
  `;

// Reset page button
$('btn-reset-page')?.addEventListener('click', () => {
  window.parent.postMessage({ type: 'OUROBOROS_RESET_PAGE' }, '*');
});

// Clear all data button
$('btn-clear-storage')?.addEventListener('click', async () => {
  const confirmed = confirm(
    'This will clear your API key, config, and prompt library. Are you sure?'
  );
  if (!confirmed) return;
  await chrome.storage.sync.clear();
  await chrome.storage.local.clear();
  window.parent.postMessage({ type: 'OUROBOROS_RESET_PAGE' }, '*');
});

  $('btn-reconfig')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_ONBOARDING' });
  });

  $('btn-soft-reload')?.addEventListener('click', () => {
    window.parent.postMessage({ type: 'OUROBOROS_RESET_PAGE' }, '*');
  });

  ['auto', 'trigger', 'share'].forEach(key => {
    const el = $(`toggle-${key}`);
    const configKey = { auto: 'autoAnalyze', trigger: 'showDrawerTrigger', share: 'shareAnonymousData' }[key];
    el?.addEventListener('change', async () => {
      await saveConfig({ [configKey]: el.checked });
      state.config = await getConfig();
    });
  });
}

function setupSettings() {
  // Settings are rendered dynamically — nothing static to attach here
}

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
  $('btn-settings')?.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === 'settings');
    });
    document.querySelectorAll('.tab-view').forEach(v => {
      v.classList.toggle('active', v.id === 'view-settings');
    });
    renderSettings();
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
  const btn = $('btn-optimize');
  const label = $('btn-optimize-label');
  const icon = btn?.querySelector('.btn-icon');

  if (!btn) return;
  btn.disabled = loading;
  if (label) label.textContent = loading ? 'Improving...' : 'Improve prompt';
  if (icon) icon.classList.toggle('spinning', loading);
}

function showError(message) {
  const preview = $('preview-text');
  if (preview) {
    preview.innerHTML = `<span style="color: var(--color-error)">Error: ${escapeHtml(message)}</span>`;
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
