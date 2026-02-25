// Ouroboros — OpenAI Adapter

import { BaseAdapter } from './base.js';

export class OpenAIAdapter extends BaseAdapter {
  validate() {
    if (!this.config.apiKey) throw new Error('OpenAI API key not configured');
  }

  async callLLM({ systemPrompt, userMessage }) {
    this.validate();

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1000,
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `OpenAI error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }
}
