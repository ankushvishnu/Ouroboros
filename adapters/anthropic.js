// Ouroboros — Anthropic Adapter

import { BaseAdapter } from './base.js';

export class AnthropicAdapter extends BaseAdapter {
  validate() {
    if (!this.config.apiKey) throw new Error('Anthropic API key not configured');
  }

  async callLLM({ systemPrompt, userMessage }) {
    this.validate();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Anthropic error: ${response.status}`);
    }

    const data = await response.json();
    return data.content?.map(b => b.text).join('') || '';
  }
}
