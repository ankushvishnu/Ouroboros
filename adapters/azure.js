// Ouroboros — Azure OpenAI Adapter
// Phase 1.1 Enterprise ready — uses tenant's own Azure OpenAI deployment

import { BaseAdapter } from './base.js';

export class AzureAdapter extends BaseAdapter {
  validate() {
    if (!this.config.azureEndpoint) throw new Error('Azure OpenAI endpoint not configured');
    if (!this.config.azureDeployment) throw new Error('Azure deployment name not configured');
    if (!this.config.apiKey) throw new Error('Azure API key not configured');
  }

  async callLLM({ systemPrompt, userMessage }) {
    this.validate();

    const { azureEndpoint, azureDeployment, azureApiVersion, apiKey } = this.config;
    const url = `${azureEndpoint}/openai/deployments/${azureDeployment}/chat/completions?api-version=${azureApiVersion}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
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
      throw new Error(err?.error?.message || `Azure OpenAI error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }
}
