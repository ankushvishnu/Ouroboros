// Ouroboros — OpenRouter Adapter

export class OpenRouterAdapter {
  constructor(config) {
    this.config = config;
  }

  async optimize({ prompt, provenance }) {
    const apiKey = this.config.apiKey;
    const model = 'mistralai/mistral-7b-instruct:free';

    console.log('[Ouroboros] OpenRouter calling model:', model);
    console.log('[Ouroboros] Prompt:', prompt);

    const systemPrompt = `You are a prompt engineer. Improve the user's prompt. Return ONLY valid JSON:
{"improved": "<improved prompt>", "changes": ["<what changed>"], "complexity": "low", "reasoning": "<why>"}
If no improvement needed, return the original with empty changes array.`;

    const body = {
      model,
      max_tokens: 1000,
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
    };

    console.log('[Ouroboros] Request body:', JSON.stringify(body));

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://ouroboros.dev',
        'X-Title': 'Ouroboros',
      },
      body: JSON.stringify(body),
    });

    console.log('[Ouroboros] Response status:', response.status);

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('[Ouroboros] OpenRouter error:', err);
      throw new Error(err?.error?.message || `OpenRouter error: ${response.status}`);
    }

    const data = await response.json();
    console.log('[Ouroboros] Raw response:', JSON.stringify(data));

    const text = data.choices?.[0]?.message?.content || '';
    console.log('[Ouroboros] Model output:', text);

    try {
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      return {
        original: prompt,
        improved: parsed.improved || prompt,
        changes: parsed.changes || [],
        complexity: parsed.complexity || 'low',
        reasoning: parsed.reasoning || '',
        inferenceLayer: 'cloud',
        provenance,
      };
    } catch (e) {
      console.error('[Ouroboros] JSON parse failed:', e);
      return {
        original: prompt,
        improved: prompt,
        changes: [],
        complexity: 'none',
        reasoning: 'Could not parse response.',
        inferenceLayer: 'cloud',
        provenance,
      };
    }
  }
}