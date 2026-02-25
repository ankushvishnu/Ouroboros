// Ouroboros — Drawer Injector
// Injects a small trigger button near active textareas
// Clicking opens the Ouroboros app drawer

(function () {
  'use strict';

  let triggerButton = null;
  let drawerFrame = null;
  let drawerOpen = false;
  let currentTextarea = null;

  // ── Create the trigger button ─────────────────────────────────────────────
  function createTrigger() {
    const btn = document.createElement('button');
    btn.id = 'ouroboros-trigger';
    btn.title = 'Ouroboros — Improve this prompt';
    btn.setAttribute('aria-label', 'Open Ouroboros prompt optimizer');
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="36" stroke="#b4ff64" stroke-width="8"
          stroke-dasharray="185 40" stroke-linecap="round"/>
        <polygon points="79,44 91,50 79,56" fill="#b4ff64"
          transform="rotate(48,85,50)"/>
      </svg>
    `;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleDrawer();
    });

    return btn;
  }

  // ── Create the drawer iframe ──────────────────────────────────────────────
  function createDrawer() {
    const frame = document.createElement('iframe');
    frame.id = 'ouroboros-drawer-frame';
    frame.src = chrome.runtime.getURL('drawer/drawer.html');
    frame.setAttribute('aria-label', 'Ouroboros prompt optimizer drawer');
    frame.setAttribute('allowtransparency', 'true');
    return frame;
  }

  // ── Create drawer root container ──────────────────────────────────────────
  function createDrawerRoot() {
    const root = document.createElement('div');
    root.id = 'ouroboros-drawer-root';
    document.body.appendChild(root);

    drawerFrame = createDrawer();
    root.appendChild(drawerFrame);

    return root;
  }

  // ── Toggle drawer open/closed ─────────────────────────────────────────────
  function toggleDrawer() {
    const root = document.getElementById('ouroboros-drawer-root')
      || createDrawerRoot();

    drawerOpen = !drawerOpen;

    if (drawerOpen) {
      root.classList.add('ouroboros-drawer-open');
      triggerButton?.classList.add('ouroboros-trigger-active');

      // Send current prompt to drawer
      const prompt = window.__ouroborosInterceptor?.getActivePrompt() || '';
      const provenance = window.__ouroborosInterceptor?.getProvenance() || 'typed';
      const platform = window.__ouroborosInterceptor?.getPlatform() || 'generic';

      drawerFrame?.contentWindow?.postMessage({
        type: 'OUROBOROS_CONTEXT',
        payload: { prompt, provenance, platform }
      }, '*');
    } else {
      root.classList.remove('ouroboros-drawer-open');
      triggerButton?.classList.remove('ouroboros-trigger-active');
    }
  }

  // ── Position trigger near active textarea ────────────────────────────────
  function positionTrigger(el) {
    if (!el || !triggerButton) return;

    const rect = el.getBoundingClientRect();
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;

    triggerButton.style.top = `${rect.bottom + scrollY - 36}px`;
    triggerButton.style.left = `${rect.right + scrollX - 44}px`;
    triggerButton.style.display = 'flex';
  }

  // ── Listen for drawer messages ────────────────────────────────────────────
  window.addEventListener('message', (e) => {
    if (!e.data?.type?.startsWith('OUROBOROS_')) return;

    switch (e.data.type) {
      case 'OUROBOROS_APPLY_PROMPT': {
        const { prompt } = e.data.payload;
        window.__ouroborosInterceptor?.setActivePrompt(prompt);
        toggleDrawer(); // close after applying
        break;
      }

    case 'OUROBOROS_RESET_PAGE': {
      // Close drawer first then reload
      if (drawerOpen) toggleDrawer();
      setTimeout(() => window.location.reload(), 300);
      break;
      }

      case 'OUROBOROS_CLOSE_DRAWER': {
        if (drawerOpen) toggleDrawer();
        break;
      }

      case 'OUROBOROS_GET_PROMPT': {
        const prompt = window.__ouroborosInterceptor?.getActivePrompt() || '';
        const provenance = window.__ouroborosInterceptor?.getProvenance() || 'typed';
        const platform = window.__ouroborosInterceptor?.getPlatform() || 'generic';
        drawerFrame?.contentWindow?.postMessage({
          type: 'OUROBOROS_CONTEXT',
          payload: { prompt, provenance, platform }
        }, '*');
        break;
      }
    }
  });

  // ── Watch for textarea focus to show trigger ──────────────────────────────
  window.addEventListener('ouroboros:textarea-focused', (e) => {
    currentTextarea = e.detail.el;

    if (!triggerButton) {
      triggerButton = createTrigger();
      document.body.appendChild(triggerButton);
    }

    positionTrigger(currentTextarea);
  });

  // Reposition on scroll/resize
  window.addEventListener('scroll', () => {
    if (currentTextarea) positionTrigger(currentTextarea);
  }, true);

  window.addEventListener('resize', () => {
    if (currentTextarea) positionTrigger(currentTextarea);
  });

})();
