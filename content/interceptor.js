// Ouroboros — Interceptor
// Captures the active textarea value and watches for submit attempts
// Handles ChatGPT, Claude, Gemini, Copilot, and generic textareas

(function () {
  'use strict';

  // Known AI platform selectors — priority order
  const PLATFORM_SELECTORS = {
    chatgpt: {
      name: 'ChatGPT',
      textarea: '#prompt-textarea, [data-id="root"] textarea, [placeholder*="Message"]',
      submitBtn: '[data-testid="send-button"], button[aria-label="Send prompt"]',
    },
    claude: {
      name: 'Claude',
      textarea: '[contenteditable="true"].ProseMirror, div[aria-label*="Message Claude"]',
      submitBtn: 'button[aria-label="Send Message"]',
    },
    gemini: {
      name: 'Gemini',
      textarea: '.ql-editor, [contenteditable="true"][aria-label*="Enter a prompt"]',
      submitBtn: 'button[aria-label="Send message"]',
    },
    copilot: {
      name: 'Copilot',
      textarea: '#userInput, textarea[name="q"], [contenteditable="true"][aria-label*="Ask"]',
      submitBtn: 'button[aria-label="Submit"], button[type="submit"]',
    },
    perplexity: {
      name: 'Perplexity',
      textarea: 'textarea[placeholder*="Ask"], .grow textarea',
      submitBtn: 'button[aria-label="Submit"]',
    },
  };

  // Generic fallback
  const GENERIC_SELECTOR = 'textarea, [contenteditable="true"][role="textbox"]';

  // Currently active textarea
  let activeTextarea = null;
  let currentPlatform = 'generic';

  // ── Detect platform ───────────────────────────────────────────────────────
  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) return 'chatgpt';
    if (host.includes('claude.ai')) return 'claude';
    if (host.includes('gemini.google.com')) return 'gemini';
    if (host.includes('copilot.microsoft.com') || host.includes('bing.com')) return 'copilot';
    if (host.includes('perplexity.ai')) return 'perplexity';
    return 'generic';
  }

  // ── Get text from element (handles both textarea and contenteditable) ──────
  function getText(el) {
    if (!el) return '';
    if (el.tagName === 'TEXTAREA') return el.value;
    return el.innerText || el.textContent || '';
  }

  // ── Set text on element ───────────────────────────────────────────────────
  function setText(el, text) {
    if (!el) return;

    if (el.tagName === 'TEXTAREA') {
      // React-compatible value setting
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      )?.set;

      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(el, text);
      } else {
        el.value = text;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // ContentEditable
      el.innerText = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));

      // Move cursor to end
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  // ── Track active textarea ─────────────────────────────────────────────────
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (
      el.tagName === 'TEXTAREA' ||
      el.getAttribute('contenteditable') === 'true' ||
      el.getAttribute('role') === 'textbox'
    ) {
      activeTextarea = el;
      window.dispatchEvent(new CustomEvent('ouroboros:textarea-focused', {
        detail: { el, platform: currentPlatform }
      }));
    }
  }, true);

  document.addEventListener('focusout', (e) => {
    // Small delay to allow drawer interactions
    setTimeout(() => {
      if (document.activeElement === activeTextarea) return;
      if (document.querySelector('#ouroboros-drawer-root')?.contains(document.activeElement)) return;
    }, 200);
  }, true);

  // ── Expose interceptor API to drawer ─────────────────────────────────────
  window.__ouroborosInterceptor = {
    getActivePrompt() {
      return getText(activeTextarea);
    },

    getActiveElement() {
      return activeTextarea;
    },

    setActivePrompt(text) {
      setText(activeTextarea, text);
    },

    getProvenance() {
      if (!activeTextarea || !window.__ouroborosGetProvenance) return 'typed';
      return window.__ouroborosGetProvenance(activeTextarea);
    },

    getPlatform() {
      return currentPlatform;
    },
  };

  // ── Init ──────────────────────────────────────────────────────────────────
  currentPlatform = detectPlatform();

})();
