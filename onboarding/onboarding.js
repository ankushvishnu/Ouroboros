// Ouroboros — Onboarding Flow

// Inlined BACKENDS — avoids module import issues in extension pages
const BACKENDS = [
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'GPT-4o mini — fast and capable',
    requiresKey: true,
    keyLabel: 'API Key',
    keyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  {
  id: 'openrouter',
  label: 'OpenRouter',
  description: 'Access 100+ models with one key — has free tier',
  requiresKey: true,
  keyLabel: 'API Key',
  keyPlaceholder: 'sk-or-...',
  docsUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    description: 'Claude Haiku — smart and efficient',
    requiresKey: true,
    keyLabel: 'API Key',
    keyPlaceholder: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'azure',
    label: 'Azure OpenAI',
    description: "Your organization's Azure deployment",
    requiresKey: true,
    keyLabel: 'API Key',
    keyPlaceholder: 'Azure API key',
    requiresEndpoint: true,
    docsUrl: 'https://portal.azure.com',
  },
  {
    id: 'ollama',
    label: 'Ollama (Local)',
    description: 'Run models on your own machine — fully private',
    requiresKey: false,
    keyLabel: null,
    docsUrl: 'https://ollama.com',
  },
];

// Inlined storage helpers
async function getConfig() {
  const stored = await chrome.storage.sync.get(null);
  return { backend: null, apiKey: null, ollamaEndpoint: 'http://localhost:11434', ollamaModel: 'llama3.2', configured: false, ...stored };
}

async function saveConfig(partial) {
  await chrome.storage.sync.set(partial);
}

// Inlined Ollama ping
async function pingOllama(endpoint) {
  try {
    const response = await fetch(`${endpoint}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return { ok: false, error: `Status ${response.status}` };
    const data = await response.json();
    return { ok: true, models: data.models?.map(m => m.name) || [] };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── State ─────────────────────────────────────────────────────────────────
let state = {
  step: 0,
  selectedBackend: null,
  shareData: false,
  connectionTested: false,
};

const $ = (id) => document.getElementById(id);

// ── Init ──────────────────────────────────────────────────────────────────
async function init() {
  const config = await getConfig();

  // Pre-fill if already configured
  if (config.backend) {
    state.selectedBackend = config.backend;
  }

  renderBackendGrid();
  setupEventListeners();
  updateUI();
}

// ── Backend grid ──────────────────────────────────────────────────────────
function renderBackendGrid() {
  const grid = $('backend-grid');
  if (!grid) return;

  grid.innerHTML = BACKENDS.map(b => `
    <div class="backend-card${state.selectedBackend === b.id ? ' selected' : ''}"
         data-backend="${b.id}">
      <div class="backend-card-name">${b.label}</div>
      <div class="backend-card-desc">${b.description}</div>
    </div>
  `).join('');

  grid.querySelectorAll('.backend-card').forEach(card => {
    card.addEventListener('click', () => selectBackend(card.dataset.backend));
  });
}

function selectBackend(id) {
  state.selectedBackend = id;
  state.connectionTested = false;
  renderBackendGrid();
  updateFieldsForBackend(id);
  updateTestButton();
  hideStatus();

  // Auto-detect Ollama models
  if (id === 'ollama') detectOllamaModels();
}

function updateFieldsForBackend(id) {
  const backend = BACKENDS.find(b => b.id === id);
  if (!backend) return;

  // Key field
  const keyField = $('key-field');
  const keyLabel = $('key-label');
  const keyInput = $('api-key-input');
  const keyHelp = $('key-help');

  if (backend.requiresKey) {
    keyField.style.display = 'block';
    if (keyLabel) keyLabel.textContent = backend.keyLabel;
    if (keyInput) keyInput.placeholder = backend.keyPlaceholder;
    if (keyHelp) keyHelp.innerHTML = `Get your key at <a href="${backend.docsUrl}" target="_blank">${backend.docsUrl}</a>`;
  } else {
    keyField.style.display = 'none';
  }

  // Azure extra fields
  $('azure-fields').style.display = id === 'azure' ? 'block' : 'none';

  // Ollama fields
  $('ollama-fields').style.display = id === 'ollama' ? 'block' : 'none';
}

// ── Ollama model detection ────────────────────────────────────────────────
async function detectOllamaModels() {
  const hint = $('ollama-models-hint');
  const modelInput = $('ollama-model');
  const endpoint = $('ollama-endpoint')?.value || 'http://localhost:11434';

  if (hint) hint.textContent = 'Detecting available models...';

  const result = await pingOllama(endpoint);

  if (result.ok && result.models.length > 0) {
    if (hint) hint.textContent = `Found: ${result.models.join(', ')}`;
    if (modelInput && !modelInput.value) modelInput.value = result.models[0];
  } else {
    if (hint) hint.textContent = result.error
      ? `Ollama not detected. Is it running? ${result.error}`
      : 'No models found. Pull a model with: ollama pull llama3.2';
  }
}

// ── Connection test ───────────────────────────────────────────────────────
async function testConnection() {
  const btn = $('btn-test');
  btn.disabled = true;
  btn.textContent = 'Testing...';
  hideStatus();

  try {
    const config = buildConfig();
    console.log('[Ouroboros] Saving config:', config);
    await saveConfig(config);

    const saved = await getConfig();
    console.log('[Ouroboros] Saved config reads back as:', saved);

    // Send a minimal test message via background
    const response = await chrome.runtime.sendMessage({
      type: 'OPTIMIZE_PROMPT',
      payload: { prompt: 'Hello', provenance: 'typed' },
    });

    if (response.error) throw new Error(response.error);

    state.connectionTested = true;
    showStatus('success', '✓ Connected successfully');
    btn.textContent = 'Connected ✓';

    // Auto-advance after short delay
    setTimeout(() => goToStep(1), 800);

  } catch (err) {
    showStatus('error', `✕ ${err.message}`);
    btn.disabled = false;
    btn.textContent = 'Try again';
  }
}

// ── Build config from form ────────────────────────────────────────────────
function buildConfig() {
  const backend = state.selectedBackend;

  // Start with a clean slate — explicitly null everything
  // so stale keys from previous setups don't persist
  const clean = {
    backend,
    configured: true,
    apiKey: null,
    ollamaEndpoint: 'http://localhost:11434',
    ollamaModel: 'llama3.2',
    azureEndpoint: null,
    azureDeployment: null,
    azureApiVersion: '2024-02-01',
    openrouterModel: null,
  };

  if (backend === 'ollama') {
    return {
      ...clean,
      ollamaEndpoint: $('ollama-endpoint')?.value || 'http://localhost:11434',
      ollamaModel: $('ollama-model')?.value || 'llama3.2',
    };
  }

  if (backend === 'azure') {
    return {
      ...clean,
      apiKey: $('api-key-input')?.value || '',
      azureEndpoint: $('azure-endpoint')?.value || '',
      azureDeployment: $('azure-deployment')?.value || '',
    };
  }

  if (backend === 'openrouter') {
    return {
      ...clean,
      apiKey: $('api-key-input')?.value || '',
      openrouterModel: 'mistralai/mistral-7b-instruct:free',
    };
  }

  // openai / anthropic
  return {
    ...clean,
    apiKey: $('api-key-input')?.value || '',
  };
}

// ── Finish setup ──────────────────────────────────────────────────────────
async function finishSetup() {
  await saveConfig({
    configured: true,
    shareAnonymousData: state.shareData,
    onboardingComplete: true,
  });

  goToStep(2);
}

// ── Step navigation ───────────────────────────────────────────────────────
function goToStep(n) {
  state.step = n;
  updateUI();
}

function updateUI() {
  // Steps
  document.querySelectorAll('.step').forEach((el, i) => {
    el.classList.toggle('active', i === state.step);
  });

  // Dots
  [0, 1, 2].forEach(i => {
    const dot = $(`dot-${i}`);
    if (!dot) return;
    dot.classList.remove('active', 'done');
    if (i === state.step) dot.classList.add('active');
    else if (i < state.step) dot.classList.add('done');
  });
}

function updateTestButton() {
  const btn = $('btn-test');
  if (!btn) return;
  btn.disabled = !state.selectedBackend;
  btn.textContent = state.connectionTested ? 'Connected ✓' : 'Test connection →';
}

// ── Status helpers ────────────────────────────────────────────────────────
function showStatus(type, message) {
  const el = $('connection-status');
  if (!el) return;
  el.textContent = message;
  el.className = `connection-status ${type} visible`;
}

function hideStatus() {
  const el = $('connection-status');
  if (el) el.className = 'connection-status';
}

// ── Event listeners ───────────────────────────────────────────────────────
function setupEventListeners() {
  $('btn-test')?.addEventListener('click', testConnection);
  $('btn-skip-to-privacy')?.addEventListener('click', () => goToStep(1));
  $('btn-finish')?.addEventListener('click', finishSetup);
  $('btn-close-onboarding')?.addEventListener('click', () => window.close());

  // Privacy toggle
  $('toggle-privacy')?.addEventListener('click', () => {
    state.shareData = !state.shareData;
    $('toggle-privacy').classList.toggle('on', state.shareData);
  });

  // Live validation for key input
  $('api-key-input')?.addEventListener('input', () => {
    state.connectionTested = false;
    updateTestButton();
  });
}

// ── Start ─────────────────────────────────────────────────────────────────
init();
