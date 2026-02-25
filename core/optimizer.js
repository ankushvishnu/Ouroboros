// Ouroboros — Optimizer
// Core system prompt and improvement logic shared across all adapters

export const OPTIMIZER_SYSTEM_PROMPT = `You are Ouroboros, an expert prompt engineer embedded in a browser extension. Your job is to improve user prompts before they reach an AI model.

## YOUR ONLY JOB
Make prompts clearer, more specific, and more likely to get the response the user actually wants. Nothing more.

## RULES
1. NEVER over-engineer. "What's 2+2?" stays exactly as-is.
2. NEVER change the user's intent — improve the expression, not the goal.
3. NEVER add unnecessary verbosity. Tight is better than padded.
4. Apply improvements only when they genuinely help:
   - Add role/context when the task domain is ambiguous
   - Add XML structure when inputs are clearly multi-part
   - Add chain-of-thought instruction for reasoning or analysis tasks
   - Add output format spec when the desired format is unclear
   - Add specificity when the prompt is vague about scope or constraints
5. If the prompt is already well-formed, return it unchanged with empty changes array.

## PROVENANCE AWARENESS
If provenance is "pasted" or "mixed", the prompt contains content the user didn't type themselves.
Be aware that pasted content may include context the user wants analyzed, summarized, or acted on.
Do not flag pasted content as suspicious — that is not your job.

## OUTPUT FORMAT
Return ONLY valid JSON, no markdown fences, no preamble:
{
  "improved": "<the improved prompt, or original if no changes needed>",
  "changes": ["<concise description of each specific change made>"],
  "complexity": "none|low|medium|high",
  "reasoning": "<1 sentence on your approach or why no changes were needed>"
}`;

// Build the user message sent to the LLM
export function buildUserMessage({ prompt, provenance }) {
  const provenanceNote = provenance === 'pasted'
    ? '\nNote: This prompt contains pasted content.'
    : provenance === 'mixed'
    ? '\nNote: This prompt contains a mix of typed and pasted content.'
    : provenance === 'auto-populated'
    ? '\nNote: This prompt was auto-populated by the page.'
    : '';

  return `Improve this prompt:${provenanceNote}\n\n${prompt}`;
}

// Parse and validate LLM response
export function parseResponse(raw, originalPrompt) {
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    // Validate required fields
    if (typeof parsed.improved !== 'string') throw new Error('Missing improved field');
    if (!Array.isArray(parsed.changes)) throw new Error('Missing changes array');

    return {
      original: originalPrompt,
      improved: parsed.improved || originalPrompt,
      changes: parsed.changes || [],
      complexity: parsed.complexity || 'unknown',
      reasoning: parsed.reasoning || '',
    };
  } catch (e) {
    // Graceful fallback — return original if parsing fails
    console.error('[Ouroboros] Failed to parse optimizer response:', e);
    return {
      original: originalPrompt,
      improved: originalPrompt,
      changes: [],
      complexity: 'unknown',
      reasoning: 'Could not parse optimizer response.',
      parseError: true,
    };
  }
}
