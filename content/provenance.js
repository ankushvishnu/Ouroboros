// Ouroboros — Provenance Tracker
// Detects whether content was typed, pasted, or auto-populated
// Handles both <textarea> and contenteditable divs (ChatGPT, Claude, Gemini)

(function () {
  'use strict';

  const provenanceMap = new WeakMap();

  // ── Safe text getter ──────────────────────────────────────────────────
  function getText(el) {
    if (!el) return '';
    if (el.value !== undefined) return el.value;
    return el.innerText || el.textContent || '';
  }

  // ── Attach tracking to an element ─────────────────────────────────────
  function attachProvenance(el) {
    if (provenanceMap.has(el)) return;

    const state = {
      typedContent: '',
      pastedRanges: [],
      autoPopulated: false,
      lastLength: 0,
      pasteJustFired: false,
    };

    // Detect if field was pre-filled by the page
    const initialText = getText(el).trim();
    if (initialText.length > 0) {
      state.autoPopulated = true;
      state.lastLength = initialText.length;
    }

    // Track native paste event
    el.addEventListener('paste', () => {
      state.pasteJustFired = true;
      requestAnimationFrame(() => {
        const afterLength = getText(el).length;
        state.pastedRanges.push({ start: 0, end: afterLength });
        state.lastLength = afterLength;
        console.log('[Ouroboros] Native paste detected, length:', afterLength);
      });
    }, true);

    // Track all input — handles typing, paste, and clear
    el.addEventListener('input', (e) => {
      const currentText = getText(el);
      const currentLength = currentText.length;

      // Field was cleared — full reset
      if (currentText.trim().length === 0) {
        state.typedContent = '';
        state.pastedRanges = [];
        state.autoPopulated = false;
        state.lastLength = 0;
        state.pasteJustFired = false;
        console.log('[Ouroboros] Provenance reset — field cleared');
        return;
      }

      const prevLength = state.lastLength || 0;
      const delta = currentLength - prevLength;

      // Large jump without a native paste event = React swallowed it
      if (delta > 20 && !state.pasteJustFired) {
        state.pastedRanges.push({ start: prevLength, end: currentLength });
        console.log('[Ouroboros] Paste detected via delta:', delta);
      }

      state.pasteJustFired = false;
      state.lastLength = currentLength;

      // Track typed content
      if (
        e.inputType &&
        e.inputType.startsWith('insert') &&
        e.inputType !== 'insertFromPaste'
      ) {
        state.typedContent = currentText;
      }
    }, true);

    provenanceMap.set(el, state);
  }

  // ── Get provenance classification ──────────────────────────────────────
  window.__ouroborosGetProvenance = function (el) {
    if (!el) return 'typed';
    const state = provenanceMap.get(el);
    if (!state) return 'typed';

    const hasPasted = state.pastedRanges.length > 0;
    const hasTyped = state.typedContent.length > 0;
    const isAutoPopulated = state.autoPopulated;

    if (isAutoPopulated && !hasPasted && !hasTyped) return 'auto-populated';
    if (hasPasted && hasTyped) return 'mixed';
    if (hasPasted) return 'pasted';
    return 'typed';
  };

  // ── Reset tracking for an element ─────────────────────────────────────
  window.__ouroborosResetProvenance = function (el) {
    provenanceMap.delete(el);
  };

  // ── Attach to an element if it's a text input ──────────────────────────
  function tryAttach(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
    if (
      el.tagName === 'TEXTAREA' ||
      el.getAttribute('contenteditable') === 'true' ||
      el.getAttribute('role') === 'textbox'
    ) {
      attachProvenance(el);
    }
  }

  // ── Attach to all existing elements ───────────────────────────────────
  document.querySelectorAll(
    'textarea, [contenteditable="true"], [role="textbox"]'
  ).forEach(tryAttach);

  // ── Watch for dynamically added elements (SPAs) ───────────────────────
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        tryAttach(node);
        if (node.querySelectorAll) {
          node.querySelectorAll(
            'textarea, [contenteditable="true"], [role="textbox"]'
          ).forEach(tryAttach);
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  console.log('[Ouroboros] Provenance tracker loaded');

})();