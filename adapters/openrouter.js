// Ouroboros — OpenRouter Adapter

import { BaseAdapter } from './base.js';

export class OpenRouterAdapter extends BaseAdapter {
  validate() {
    if (!this.config.apiKey) throw new Error('OpenRouter API key not configured');
  }

  async callLLM({ systemPrompt, userMessage }) {
    this.validate();

    const model = this.config.openrouterModel || 'openrouter/auto';
    console.log('[Ouroboros] OpenRouter model:', model);

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        'HTTP-Referer': 'https://papercargo.com/ouroboros',
        'X-Title': 'Ouroboros',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err?.error?.message || (typeof err?.error === 'string' ? err.error : null) || `OpenRouter error: ${response.status}`;
      throw new Error(msg);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }
}