// Ouroboros — OpenRouter Models
// Updated February 2026 — verified against openrouter.ai/models
// Full list at https://openrouter.ai/models

const OPENROUTER_MODELS = [
  // ── Free tier ────────────────────────────────────────────────────────────
  {
    id: 'openrouter/auto',
    label: 'Auto (best available free)',
    tier: 'free',
    note: 'OpenRouter picks the best free model — recommended',
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    label: 'Llama 3.3 70B',
    tier: 'free',
    note: 'Best free model — excellent quality',
  },
  {
    id: 'google/gemini-2.0-flash-exp:free',
    label: 'Gemini 2.0 Flash',
    tier: 'free',
    note: '1M context, fast and capable',
  },
  {
    id: 'mistralai/mistral-small-3.1-24b-instruct:free',
    label: 'Mistral Small 3.1 24B',
    tier: 'free',
    note: 'Solid instruction following',
  },
  {
    id: 'google/gemma-3-27b-it:free',
    label: 'Gemma 3 27B',
    tier: 'free',
    note: 'Good general purpose',
  },

  // ── Paid tier ────────────────────────────────────────────────────────────
  {
    id: 'openai/gpt-4o-mini',
    label: 'GPT-4o Mini',
    tier: 'paid',
    note: 'Fast and smart — recommended',
  },
  {
    id: 'openai/gpt-4o',
    label: 'GPT-4o',
    tier: 'paid',
    note: 'Best quality, higher cost',
  },
  {
    id: 'anthropic/claude-haiku-4-5',
    label: 'Claude Haiku',
    tier: 'paid',
    note: 'Excellent instruction following',
  },
  {
    id: 'mistralai/mistral-small-3.1-24b-instruct',
    label: 'Mistral Small 3.1 24B',
    tier: 'paid',
    note: 'Great value paid option',
  },
];
