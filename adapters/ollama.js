// Ouroboros — Ollama Adapter
// Connects to a locally running Ollama instance
// Default endpoint: http://localhost:11434

import { BaseAdapter } from './base.js';

export class OllamaAdapter extends BaseAdapter {
  validate() {
    if (!this.config.ollamaEndpoint) throw new Error('Ollama endpoint not configured');
    if (!this.config.ollamaModel) throw new Error('Ollama model not configured');
  }

  async callLLM({ systemPrompt, userMessage }) {
    this.validate();

    const { ollamaEndpoint, ollamaModel } = this.config;
    const url = `${ollamaEndpoint}/api/chat`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        stream: false,
        options: { temperature: 0.3 },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}. Is Ollama running at ${ollamaEndpoint}?`);
    }

    const data = await response.json();
    return data.message?.content || '';
  }

  // Test connection to Ollama
  async ping() {
    try {
      const response = await fetch(`${this.config.ollamaEndpoint}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) return { ok: false, error: `Status ${response.status}` };
      const data = await response.json();
      return {
        ok: true,
        models: data.models?.map(m => m.name) || [],
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
}
