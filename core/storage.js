// Ouroboros — Storage Abstraction
// Single source of truth for all persisted state

export const DEFAULT_CONFIG = {
  // Setup state
  configured: false,

  // LLM Backend — one of: openai | anthropic | azure | ollama
  backend: null,

  // API credentials (never logged, never shared)
  apiKey: null,
  ollamaEndpoint: 'http://localhost:11434',
  ollamaModel: 'llama3.2',
  azureEndpoint: null,
  azureDeployment: null,
  azureApiVersion: '2024-02-01',

  // Behavior
  autoAnalyze: true,          // Analyze as user types (debounced)
  showDrawerTrigger: true,    // Show trigger button near textarea
  complexityThreshold: 'low', // Prompts above this go to cloud

  // Privacy
  shareAnonymousData: false,  // Explicit opt-in only
  donationDismissed: false,

  // Prompt library
  savedPrompts: [],

  // Onboarding
  onboardingComplete: false,
  onboardingStep: 0,
};

// ── Get full config ─────────────────────────────────────────────────────────
export async function getConfig() {
  const stored = await chrome.storage.sync.get(null);
  return { ...DEFAULT_CONFIG, ...stored };
}

// ── Save partial config ─────────────────────────────────────────────────────
export async function saveConfig(partial) {
  await chrome.storage.sync.set(partial);
}

// ── Save a prompt to library ────────────────────────────────────────────────
export async function savePromptToLibrary(entry) {
  const config = await getConfig();
  const saved = config.savedPrompts || [];

  const newEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    original: entry.original,
    improved: entry.improved,
    changes: entry.changes || [],
    complexity: entry.complexity || 'unknown',
    tags: entry.tags || [],
    title: entry.title || generateTitle(entry.improved),
    useCount: 0,
    version: 1,
  };

  const updated = [newEntry, ...saved].slice(0, 200); // cap at 200
  await saveConfig({ savedPrompts: updated });
  return newEntry;
}

// ── Get prompt library ──────────────────────────────────────────────────────
export async function getPromptLibrary() {
  const config = await getConfig();
  return config.savedPrompts || [];
}

// ── Increment use count ─────────────────────────────────────────────────────
export async function incrementPromptUse(id) {
  const config = await getConfig();
  const saved = config.savedPrompts || [];
  const updated = saved.map(p =>
    p.id === id ? { ...p, useCount: (p.useCount || 0) + 1 } : p
  );
  await saveConfig({ savedPrompts: updated });
}

// ── Delete prompt ───────────────────────────────────────────────────────────
export async function deletePrompt(id) {
  const config = await getConfig();
  const saved = (config.savedPrompts || []).filter(p => p.id !== id);
  await saveConfig({ savedPrompts: saved });
}

// ── Clear all data ──────────────────────────────────────────────────────────
export async function clearAllData() {
  await chrome.storage.sync.clear();
  await chrome.storage.local.clear();
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function generateTitle(prompt) {
  if (!prompt) return 'Untitled prompt';
  const words = prompt.trim().split(/\s+/).slice(0, 6).join(' ');
  return words.length < prompt.trim().length ? `${words}...` : words;
}
