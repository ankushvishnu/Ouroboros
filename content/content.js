// Ouroboros — Content Script Entry Point
// Orchestrates provenance, interceptor, and drawer injector

(function () {
  'use strict';

  // Check if extension is configured before doing anything
  chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, (response) => {
    if (chrome.runtime.lastError) return;

    const config = response?.config;

    if (!config?.configured) {
      // Not configured — still inject drawer trigger
      // so user can open the setup flow from any page
      console.log('[Ouroboros] Not configured — drawer available for setup');
    }
  });

  // Listen for configuration changes
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.configured?.newValue === true) {
      console.log('[Ouroboros] Configuration complete — ready');
    }
  });

})();
