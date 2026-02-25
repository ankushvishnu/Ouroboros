// Ouroboros — Complexity Router
// Decides whether a prompt goes to local WASM or cloud LLM
// Phase 1.2: WASM not yet active — all routes go to cloud adapter
// Phase 1.2+: WASM handles simple prompts locally

import { getAdapter } from '../adapters/index.js';

// Complexity classification thresholds
const THRESHOLDS = {
  TRIVIAL_MAX_WORDS: 8,       // "what's 2+2" — don't touch
  SIMPLE_MAX_WORDS: 40,       // short prompts — WASM candidate
  COMPLEX_MIN_WORDS: 150,     // long prompts — always cloud
};

// ── Main router entry point ─────────────────────────────────────────────────
export async function route({ prompt, provenance, config }) {
  const classification = classify(prompt, provenance);

  // Trivial prompts — return as-is, no LLM call
  if (classification.complexity === 'trivial') {
    return {
      original: prompt,
      improved: prompt,
      changes: [],
      complexity: 'none',
      reasoning: 'Prompt is clear and concise as-is.',
      inferenceLayer: 'none',
      provenance,
    };
  }

  // Phase 1.2: check if WASM is available and prompt is simple
  // const wasmAvailable = await isWasmReady();
  // if (wasmAvailable && classification.complexity === 'simple' && provenance === 'typed') {
  //   return runWasm({ prompt, provenance });
  // }

  // All other cases — cloud adapter
  const adapter = getAdapter(config);
  const result = await adapter.optimize({ prompt, provenance, config });
  return { ...result, inferenceLayer: 'cloud', provenance };
}

// ── Classify prompt complexity ──────────────────────────────────────────────
export function classify(prompt, provenance = 'typed') {
  const wordCount = prompt.trim().split(/\s+/).filter(Boolean).length;
  const charCount = prompt.trim().length;
  const hasPastedContent = provenance === 'pasted' || provenance === 'mixed';
  const hasSpecialFormatting = /```|<[a-z]+>|\{.*\}|#{1,6}\s/i.test(prompt);
  const hasMultipleParts = prompt.includes('\n\n') || prompt.split('\n').length > 4;

  let complexity;

  if (wordCount <= THRESHOLDS.TRIVIAL_MAX_WORDS && !hasPastedContent) {
    complexity = 'trivial';
  } else if (wordCount <= THRESHOLDS.SIMPLE_MAX_WORDS && !hasPastedContent && !hasMultipleParts) {
    complexity = 'simple';
  } else if (wordCount >= THRESHOLDS.COMPLEX_MIN_WORDS || hasMultipleParts || hasSpecialFormatting) {
    complexity = 'complex';
  } else {
    complexity = 'medium';
  }

  // Pasted content always escalates to at least medium
  if (hasPastedContent && complexity === 'trivial') {
    complexity = 'medium';
  }

  return {
    complexity,
    wordCount,
    charCount,
    hasPastedContent,
    hasSpecialFormatting,
    hasMultipleParts,
  };
}
