// Ouroboros — Adapter Factory
// Returns the correct adapter instance based on user config

import { OpenAIAdapter } from './openai.js';
import { AnthropicAdapter } from './anthropic.js';
import { AzureAdapter } from './azure.js';
import { OllamaAdapter } from './ollama.js';
import { OpenRouterAdapter } from './openrouter.js';

export function getAdapter(config) {
  console.log('[Ouroboros] getAdapter called with backend:', config.backend);
  switch (config.backend) {
    case 'openai':    return new OpenAIAdapter(config);
    case 'anthropic': return new AnthropicAdapter(config);
    case 'azure':     return new AzureAdapter(config);
    case 'ollama':    return new OllamaAdapter(config);
    case 'openrouter': return new OpenRouterAdapter(config);
    default:
      throw new Error(`Unknown backend: ${config.backend}. Please complete setup.`);
  }
}

export const BACKENDS = [
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
    description: 'Your organization\'s Azure deployment',
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
