// Ouroboros — Diff Engine
// Word-level diff between original and improved prompt
// Used by the drawer ReviewView to show exactly what changed

// ── Main diff function ──────────────────────────────────────────────────────
export function diffWords(original, improved) {
  if (!original || !improved) return [];
  if (original === improved) return [{ type: 'same', text: original }];

  const origTokens = tokenize(original);
  const impTokens = tokenize(improved);

  const matrix = buildLCSMatrix(origTokens, impTokens);
  const diff = traceback(matrix, origTokens, impTokens);

  return mergeSameTokens(diff);
}

// ── Summary of changes ──────────────────────────────────────────────────────
export function diffSummary(diff) {
  const added = diff.filter(t => t.type === 'add').length;
  const removed = diff.filter(t => t.type === 'remove').length;
  return { added, removed, changed: added > 0 || removed > 0 };
}

// ── Tokenize into words + whitespace ───────────────────────────────────────
function tokenize(text) {
  // Split on whitespace but keep the whitespace as separate tokens
  return text.split(/(\s+)/).filter(t => t.length > 0);
}

// ── Longest Common Subsequence matrix ──────────────────────────────────────
function buildLCSMatrix(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp;
}

// ── Traceback to build diff ─────────────────────────────────────────────────
function traceback(matrix, a, b) {
  const result = [];
  let i = a.length;
  let j = b.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift({ type: 'same', text: a[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
      result.unshift({ type: 'add', text: b[j - 1] });
      j--;
    } else {
      result.unshift({ type: 'remove', text: a[i - 1] });
      i--;
    }
  }

  return result;
}

// ── Merge consecutive same tokens for cleaner rendering ────────────────────
function mergeSameTokens(diff) {
  const merged = [];

  for (const token of diff) {
    const last = merged[merged.length - 1];
    if (last && last.type === token.type && token.type === 'same') {
      last.text += token.text;
    } else {
      merged.push({ ...token });
    }
  }

  return merged;
}
