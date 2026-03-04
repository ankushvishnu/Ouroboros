// Ouroboros — Drawer Injector
// Injects a small trigger button near active textareas
// Clicking opens the Ouroboros app drawer

(function () {
  'use strict';

  let triggerButton = null;
  let drawerFrame = null;
  let drawerOpen = false;
  let currentTextarea = null;

  // ── Live sync — debounced input listener while drawer is open ─────────────
  let _syncDebounce = null;

  function sendContextToDrawer() {
    const prompt     = window.__ouroborosInterceptor?.getActivePrompt() || '';
    const provenance = window.__ouroborosInterceptor?.getProvenance()   || 'typed';
    const platform   = window.__ouroborosInterceptor?.getPlatform()     || 'generic';
    drawerFrame?.contentWindow?.postMessage({
      type: 'OUROBOROS_CONTEXT',
      payload: { prompt, provenance, platform }
    }, '*');
  }

  function onTextareaInput() {
    if (!drawerOpen) return;
    clearTimeout(_syncDebounce);
    _syncDebounce = setTimeout(sendContextToDrawer, 200);
  }

  function attachLiveSync(el) {
    if (!el) return;
    el.addEventListener('input', onTextareaInput, true);
  }

  function detachLiveSync(el) {
    if (!el) return;
    el.removeEventListener('input', onTextareaInput, true);
    clearTimeout(_syncDebounce);
  }

  // ── Create the trigger button ─────────────────────────────────────────────
  function createTrigger() {
    const btn = document.createElement('button');
    btn.id = 'ouroboros-trigger';
    btn.title = 'Ouroboros — Improve this prompt';
    btn.setAttribute('aria-label', 'Open Ouroboros prompt optimizer');
    const iconUrl = chrome.runtime.getURL('assets/icons/icon-32.png');
    btn.innerHTML = `<img src="${iconUrl}" width="18" height="18" alt="" style="border-radius:50%">`;

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

      // Send current prompt immediately on open
      sendContextToDrawer();

      // Start live sync — updates drawer preview as user types
      attachLiveSync(currentTextarea);
    } else {
      root.classList.remove('ouroboros-drawer-open');
      triggerButton?.classList.remove('ouroboros-trigger-active');

      // Stop live sync on close
      detachLiveSync(currentTextarea);
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

      case 'OUROBOROS_CLOSE_DRAWER': {
        if (drawerOpen) toggleDrawer();
        break;
      }

      case 'OUROBOROS_RESET_PAGE': {
        if (drawerOpen) toggleDrawer();
        setTimeout(() => window.location.reload(), 300);
        break;
      }

      case 'OUROBOROS_GET_PROMPT': {
        sendContextToDrawer();
        break;
      }
    }
  });

  // ── Watch for textarea focus to show trigger ──────────────────────────────
  window.addEventListener('ouroboros:textarea-focused', (e) => {
    const prevTextarea = currentTextarea;
    currentTextarea = e.detail.el;

    if (!triggerButton) {
      triggerButton = createTrigger();
      document.body.appendChild(triggerButton);
    }

    positionTrigger(currentTextarea);

    // If drawer is open and focus moved to a different textarea,
    // re-attach live sync to the new element and send fresh context
    if (drawerOpen && currentTextarea !== prevTextarea) {
      detachLiveSync(prevTextarea);
      attachLiveSync(currentTextarea);
      sendContextToDrawer();
    }
  });

  // Reposition on scroll/resize
  window.addEventListener('scroll', () => {
    if (currentTextarea) positionTrigger(currentTextarea);
  }, true);

  window.addEventListener('resize', () => {
    if (currentTextarea) positionTrigger(currentTextarea);
  });

})();