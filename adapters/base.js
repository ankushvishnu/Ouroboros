// Ouroboros — Base Adapter
// All LLM adapters extend this interface

import { OPTIMIZER_SYSTEM_PROMPT, buildUserMessage, parseResponse } from '../core/optimizer.js';

export class BaseAdapter {
  constructor(config) {
    this.config = config;
  }

  // Every adapter must implement this
  async callLLM({ systemPrompt, userMessage }) {
    throw new Error('callLLM() must be implemented by adapter');
  }

  // Shared optimize flow — all adapters use this
  async optimize({ prompt, provenance }) {
    const userMessage = buildUserMessage({ prompt, provenance });

    const raw = await this.callLLM({
      systemPrompt: OPTIMIZER_SYSTEM_PROMPT,
      userMessage,
    });

    return parseResponse(raw, prompt);
  }

  // Validate config before making calls
  validate() {
    throw new Error('validate() must be implemented by adapter');
  }
}
