// Ouroboros — Onboarding
// Step 0: Email check (skippable)
// Step 1: Backend setup
// Step 2: Privacy consent
// Step 3: Done (personalised)

// ── Backends ──────────────────────────────────────────────────────────────
var BACKENDS = [
  { id: 'openrouter', label: 'OpenRouter',     description: 'Free tier available — 100+ models',   requiresKey: true,  keyLabel: 'API Key', keyPlaceholder: 'sk-or-...',  docsUrl: 'https://openrouter.ai/keys' },
  { id: 'openai',     label: 'OpenAI',         description: 'GPT-4o mini — fast and capable',       requiresKey: true,  keyLabel: 'API Key', keyPlaceholder: 'sk-...',     docsUrl: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic',  label: 'Anthropic',      description: 'Claude Haiku — smart and efficient',   requiresKey: true,  keyLabel: 'API Key', keyPlaceholder: 'sk-ant-...', docsUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'azure',      label: 'Azure OpenAI',   description: "Your organisation's Azure deployment", requiresKey: true,  keyLabel: 'API Key', keyPlaceholder: 'Azure API key', requiresEndpoint: true, docsUrl: 'https://portal.azure.com' },
  { id: 'ollama',     label: 'Ollama (Local)', description: 'Run models locally — fully private',   requiresKey: false, keyLabel: null, docsUrl: 'https://ollama.com' },
];

var OPENROUTER_MODELS = [
  { group: 'Free tier', models: [
    { id: 'openrouter/auto',                                label: 'Auto (recommended)' },
    { id: 'meta-llama/llama-3.3-70b-instruct:free',        label: 'Llama 3.3 70B' },
    { id: 'google/gemini-2.0-flash-exp:free',              label: 'Gemini 2.0 Flash' },
    { id: 'mistralai/mistral-small-3.1-24b-instruct:free', label: 'Mistral Small 3.1' },
    { id: 'google/gemma-3-27b-it:free',                    label: 'Gemma 3 27B' },
  ]},
  { group: 'Paid', models: [
    { id: 'openai/gpt-4o-mini',               label: 'GPT-4o mini' },
    { id: 'openai/gpt-4o',                    label: 'GPT-4o' },
    { id: 'anthropic/claude-haiku-4-5',       label: 'Claude Haiku' },
  ]},
];

var TIER_INFO = {
  beta:  { badge: '✦ Beta',  cssClass: 'beta',  desc: 'Unlimited improvements during the beta period. Thank you for being an early supporter.' },
  trial: { badge: 'Trial',   cssClass: 'trial', desc: '5 improvements per session. A 2-hour cooldown applies when you hit the limit.' },
  free:  { badge: 'Free',    cssClass: 'free',  desc: '5 free improvements per session with a 2-hour cooldown. Sign in on the paywall screen anytime to upgrade.' },
};

// ── State ─────────────────────────────────────────────────────────────────
var state = {
  step: 0,
  userEmail: null,
  licenseType: 'free',
  validUntil: null,
  selectedBackend: null,
  connectionTested: false,
  shareData: false,
};

function $(id) { return document.getElementById(id); }

// ── Init ──────────────────────────────────────────────────────────────────
function init() {
  chrome.storage.sync.get(null, function(stored) {
    if (stored.backend)    state.selectedBackend = stored.backend;
    if (stored.userEmail)  state.userEmail = stored.userEmail;
    if (stored.licenseType) state.licenseType = stored.licenseType;

    renderOpenRouterModels();
    renderBackendGrid();
    attachListeners();
    showStep(0);
  });
}

// ── Step rendering ────────────────────────────────────────────────────────
function showStep(n) {
  state.step = n;
  document.querySelectorAll('.step').forEach(function(el, i) {
    el.classList.toggle('active', i === n);
  });
  [0, 1, 2, 3].forEach(function(i) {
    var dot = $('dot-' + i);
    if (!dot) return;
    dot.classList.remove('active', 'done');
    if (i === n) dot.classList.add('active');
    else if (i < n) dot.classList.add('done');
  });
  if (n === 3) renderDoneScreen();
}

// ── Step 0: Email ─────────────────────────────────────────────────────────
function checkEmail() {
  var email = ($('email-input').value || '').trim();
  if (!email || !email.includes('@')) {
    setStatus('email-status', 'error', 'Please enter a valid email address.');
    return;
  }

  var btn = $('btn-check-email');
  btn.disabled = true;
  btn.textContent = 'Checking...';
  clearStatus('email-status');
  hideTierCard();

  chrome.runtime.sendMessage({ type: 'LOOKUP_EMAIL', payload: { email: email } }, function(result) {
    if (chrome.runtime.lastError) {
      setStatus('email-status', 'error', 'Could not connect to extension. Try reloading.');
      btn.disabled = false;
      btn.textContent = 'Check access →';
      return;
    }

    state.userEmail = email;

    if (result && result.found && result.licenseType && result.licenseType !== 'none') {
      state.licenseType = result.licenseType;
      state.validUntil  = result.validUntil || null;

      chrome.runtime.sendMessage({ type: 'SAVE_USER', payload: { email: email, licenseType: result.licenseType, validUntil: result.validUntil } });

      showTierCard(result.licenseType, email);
      setStatus('email-status', 'success', 'Access confirmed. Continue to set up your LLM backend.');
      btn.textContent = 'Continue →';
      btn.disabled = false;
      btn.onclick = function() { showStep(1); };

    } else {
      state.licenseType = 'free';
      showTierCard('free', email);
      var msg = (result && result.found)
        ? "Account found but access has expired. You'll start on the free trial."
        : "No early access found for this email. You'll start on the free trial — 5 improvements to begin.";
      setStatus('email-status', 'info', msg);
      btn.textContent = 'Continue →';
      btn.disabled = false;
      btn.onclick = function() { showStep(1); };
    }
  });
}

function showTierCard(tier, email) {
  var info = TIER_INFO[tier] || TIER_INFO.free;
  var card = $('tier-card');
  var badge = $('tier-badge');
  var emailEl = $('tier-card-email');
  var descEl = $('tier-card-desc');
  if (!card) return;
  card.className = 'tier-card ' + info.cssClass + ' visible';
  badge.className = 'tier-badge ' + info.cssClass;
  badge.textContent = info.badge;
  emailEl.textContent = email;
  descEl.textContent = info.desc;
}

function hideTierCard() {
  var card = $('tier-card');
  if (card) card.className = 'tier-card';
}

// ── Step 1: Backend ───────────────────────────────────────────────────────
function renderBackendGrid() {
  var grid = $('backend-grid');
  if (!grid) return;
  grid.innerHTML = BACKENDS.map(function(b) {
    var sel = state.selectedBackend === b.id ? ' selected' : '';
    return '<div class="backend-card' + sel + '" data-backend="' + b.id + '">'
      + '<div class="backend-card-name">' + b.label + '</div>'
      + '<div class="backend-card-desc">' + b.description + '</div>'
      + '</div>';
  }).join('');
  grid.querySelectorAll('.backend-card').forEach(function(card) {
    card.addEventListener('click', function() { selectBackend(card.dataset.backend); });
  });
}

function renderOpenRouterModels() {
  var sel = $('openrouter-model-select');
  if (!sel) return;
  sel.innerHTML = OPENROUTER_MODELS.map(function(g) {
    return '<optgroup label="' + g.group + '">'
      + g.models.map(function(m) { return '<option value="' + m.id + '">' + m.label + '</option>'; }).join('')
      + '</optgroup>';
  }).join('');
}

function selectBackend(id) {
  state.selectedBackend = id;
  state.connectionTested = false;
  renderBackendGrid();
  updateBackendFields(id);
  updateTestBtn();
  clearStatus('connection-status');
  if (id === 'ollama') detectOllamaModels();
}

function updateBackendFields(id) {
  var backend = null;
  for (var i = 0; i < BACKENDS.length; i++) { if (BACKENDS[i].id === id) { backend = BACKENDS[i]; break; } }
  if (!backend) return;

  var keyField = $('key-field');
  var keyLabel = $('key-label');
  var keyInput = $('api-key-input');
  var keyHelp  = $('key-help');

  if (backend.requiresKey) {
    if (keyField) keyField.style.display = 'block';
    if (keyLabel) keyLabel.textContent = backend.keyLabel;
    if (keyInput) keyInput.placeholder = backend.keyPlaceholder;
    if (keyHelp)  keyHelp.innerHTML = 'Get your key at <a href="' + backend.docsUrl + '" target="_blank">' + backend.docsUrl + '</a>';
  } else {
    if (keyField) keyField.style.display = 'none';
  }

  var az = $('azure-fields');
  var ol = $('ollama-fields');
  var or = $('openrouter-fields');
  if (az) az.style.display = (id === 'azure')      ? 'block' : 'none';
  if (ol) ol.style.display = (id === 'ollama')     ? 'block' : 'none';
  if (or) or.style.display = (id === 'openrouter') ? 'block' : 'none';
}

function detectOllamaModels() {
  var hint = $('ollama-models-hint');
  var modelInput = $('ollama-model');
  var endpoint = ($('ollama-endpoint') || {}).value || 'http://localhost:11434';
  if (hint) hint.textContent = 'Detecting available models...';

  fetch(endpoint + '/api/tags', { method: 'GET', signal: AbortSignal.timeout(3000) })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var models = (data.models || []).map(function(m) { return m.name; });
      if (models.length > 0) {
        if (hint) hint.textContent = 'Found: ' + models.join(', ');
        if (modelInput && !modelInput.value) modelInput.value = models[0];
      } else {
        if (hint) hint.textContent = 'No models found. Run: ollama pull llama3.2';
      }
    })
    .catch(function(e) {
      if (hint) hint.textContent = 'Ollama not detected. Is it running? (' + e.message + ')';
    });
}

function testConnection() {
  var btn = $('btn-test');
  btn.disabled = true;
  btn.textContent = 'Testing...';
  clearStatus('connection-status');

  var config = buildConfig();
  chrome.storage.sync.set(config, function() {
    chrome.runtime.sendMessage({ type: 'OPTIMIZE_PROMPT', payload: { prompt: 'Hello', provenance: 'typed' } }, function(response) {
      if (chrome.runtime.lastError) {
        setStatus('connection-status', 'error', '✕ ' + chrome.runtime.lastError.message);
        btn.disabled = false;
        btn.textContent = 'Try again';
        return;
      }
      if (response && response.error && response.error !== 'NOT_CONFIGURED' && response.error !== 'DAILY_LIMIT_REACHED') {
        setStatus('connection-status', 'error', '✕ ' + response.error);
        btn.disabled = false;
        btn.textContent = 'Try again';
        return;
      }
      state.connectionTested = true;
      setStatus('connection-status', 'success', '✓ Connected successfully');
      btn.textContent = 'Connected ✓';
      setTimeout(function() { showStep(2); }, 700);
    });
  });
}

function buildConfig() {
  var id = state.selectedBackend;
  var base = {
    backend: id,
    configured: true,
    apiKey: null,
    ollamaEndpoint: 'http://localhost:11434',
    ollamaModel: 'llama3.2',
    azureEndpoint: null,
    azureDeployment: null,
    azureApiVersion: '2024-02-01',
    openrouterModel: null,
    userEmail: state.userEmail,
    licenseType: state.licenseType,
  };
  if (id === 'ollama')     return Object.assign({}, base, { ollamaEndpoint: ($('ollama-endpoint')||{}).value||'http://localhost:11434', ollamaModel: ($('ollama-model')||{}).value||'llama3.2' });
  if (id === 'azure')      return Object.assign({}, base, { apiKey: ($('api-key-input')||{}).value||'', azureEndpoint: ($('azure-endpoint')||{}).value||'', azureDeployment: ($('azure-deployment')||{}).value||'' });
  if (id === 'openrouter') return Object.assign({}, base, { apiKey: ($('api-key-input')||{}).value||'', openrouterModel: ($('openrouter-model-select')||{}).value||'openrouter/auto' });
  return Object.assign({}, base, { apiKey: ($('api-key-input')||{}).value||'' });
}

function updateTestBtn() {
  var btn = $('btn-test');
  if (!btn) return;
  btn.disabled = !state.selectedBackend;
  btn.textContent = state.connectionTested ? 'Connected ✓' : 'Test connection →';
}

// ── Step 2: Privacy ───────────────────────────────────────────────────────
function finishSetup() {
  chrome.storage.sync.set({
    configured: true,
    shareAnonymousData: state.shareData,
    onboardingComplete: true,
    userEmail: state.userEmail,
    licenseType: state.licenseType,
  }, function() {
    showStep(3);
  });
}

// ── Step 3: Done ──────────────────────────────────────────────────────────
function renderDoneScreen() {
  var tier = state.licenseType || 'free';
  var info = TIER_INFO[tier] || TIER_INFO.free;

  var emailEl = $('done-email');
  var badgeEl = $('done-tier-badge');
  var noteEl  = $('done-identity-note');

  if (emailEl) emailEl.textContent = state.userEmail || 'Free trial';
  if (badgeEl) { badgeEl.textContent = info.badge; badgeEl.className = 'tier-badge ' + info.cssClass; }
  if (noteEl)  noteEl.textContent = info.desc;
}

// ── Status helpers ────────────────────────────────────────────────────────
function setStatus(id, type, msg) {
  var el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.className = 'status-box ' + type;
}

function clearStatus(id) {
  var el = $(id);
  if (el) el.className = 'status-box';
}

// ── Event listeners ───────────────────────────────────────────────────────
function attachListeners() {
  // Step 0
  var btnCheck = $('btn-check-email');
  if (btnCheck) btnCheck.addEventListener('click', checkEmail);

  var btnSkip = $('btn-skip-login');
  if (btnSkip) btnSkip.addEventListener('click', function() {
    state.userEmail   = null;
    state.licenseType = 'free';
    showStep(1);
  });

  var emailInput = $('email-input');
  if (emailInput) emailInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') checkEmail();
  });

  // Step 1
  var btnTest = $('btn-test');
  if (btnTest) btnTest.addEventListener('click', testConnection);

  var btnSkipBackend = $('btn-skip-backend');
  if (btnSkipBackend) btnSkipBackend.addEventListener('click', function() { showStep(2); });

  var apiKeyInput = $('api-key-input');
  if (apiKeyInput) apiKeyInput.addEventListener('input', function() {
    state.connectionTested = false;
    updateTestBtn();
  });

  // Step 2
  var togglePrivacy = $('toggle-privacy');
  if (togglePrivacy) togglePrivacy.addEventListener('click', function() {
    state.shareData = !state.shareData;
    togglePrivacy.classList.toggle('on', state.shareData);
  });

  var btnFinish = $('btn-finish');
  if (btnFinish) btnFinish.addEventListener('click', finishSetup);

  // Step 3
  var btnClose = $('btn-close-onboarding');
  if (btnClose) btnClose.addEventListener('click', function() { window.close(); });
}

// ── Start ─────────────────────────────────────────────────────────────────
init();
