# Ouroboros — Prompt Optimizer

> Human-approved prompt optimization. Improve what you send to AI — always with your eyes open.

---

## What it does

Ouroboros sits in your browser and improves prompts before you send them to any AI interface. It intercepts your text, suggests improvements using an LLM of your choice, shows you exactly what changed, and waits for your approval. Nothing is sent without you seeing it first.

---

## Install (Development)

### Chrome / Edge

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked**
5. Select the `ouroboros/` folder
6. The extension installs and the setup page opens automatically

### Edge
Same process — navigate to `edge://extensions` instead.

---

## Setup

On first install, Ouroboros opens a setup page where you choose your LLM backend:

| Backend | What you need |
|---|---|
| **OpenAI** | API key from platform.openai.com |
| **Anthropic** | API key from console.anthropic.com |
| **Azure OpenAI** | Endpoint URL, deployment name, API key |
| **Ollama** | Ollama running locally at localhost:11434 |

Your API key is stored in Chrome's encrypted sync storage. It is never logged, never shared, never sent anywhere except the API endpoint you configured.

---

## How to use

1. Go to any AI interface (ChatGPT, Claude, Gemini, Copilot, etc.) or any page with a text field
2. Click inside a text area — a small **⊙** button appears near it
3. Type your prompt
4. Click the **⊙** button to open the Ouroboros drawer
5. Click **Improve prompt**
6. Review the improved version, see the diff, and choose:
   - **Use this** — applies the improved prompt
   - **Use original** — sends your original unchanged
   - **Save to library** — saves for future reuse
7. Your prompt is updated in the text field. You send it yourself.

---

## Provenance flag

If you paste content or if the page auto-populates the text field, Ouroboros shows a neutral indicator: *"Contains pasted content — review before sending."* This is informational only — not a warning or a block.

---

## Prompt library

Every prompt you save appears in the **Library** tab of the drawer. Search, reuse with one click, or delete. Your library syncs across Chrome/Edge via your browser's sync storage.

---

## Privacy

- **Prompt content**: never logged, never sent anywhere except your chosen LLM endpoint
- **API keys**: stored in Chrome encrypted sync storage, never transmitted to Ouroboros servers
- **Anonymous usage data**: opt-in only during setup. Collects prompt length, complexity classification, and approval decision — never content
- **No Ouroboros servers**: all processing happens between your browser and your chosen LLM endpoint directly

---

## Project structure

```
ouroboros/
├── manifest.json              # Extension manifest (Manifest V3)
├── background/
│   └── service-worker.js      # API routing, storage events
├── content/
│   ├── content.js             # Entry point
│   ├── interceptor.js         # Textarea capture
│   ├── provenance.js          # Typed vs pasted detection
│   └── drawer-injector.js     # Trigger button + iframe injection
├── drawer/
│   ├── drawer.html            # App drawer UI
│   ├── drawer.js              # Drawer orchestration
│   └── drawer.css             # Drawer styles
├── onboarding/
│   ├── onboarding.html        # First launch setup
│   └── onboarding.js          # Setup flow
├── core/
│   ├── router.js              # Complexity routing
│   ├── optimizer.js           # System prompt + parsing
│   ├── diff.js                # Word-level diff engine
│   └── storage.js             # Chrome storage abstraction
├── adapters/
│   ├── index.js               # Adapter factory
│   ├── base.js                # Base interface
│   ├── openai.js
│   ├── anthropic.js
│   ├── azure.js               # Enterprise-ready
│   └── ollama.js              # Local LLM support
├── styles/
│   ├── shared.css             # Design tokens
│   └── content.css            # Injected page styles
└── wasm/                      # Reserved for Phase 1.2 (Gemma 2B)
```

---

## Roadmap

**Beta (now)** — Browser extension, user API keys, Ollama support, prompt library

**Phase 1.1** — Azure AD authentication, enterprise admin portal, Azure Monitor audit logging, group policies

**Phase 1.2** — WASM local inference layer (Gemma 2B via Transformers.js), complexity-based routing between local and cloud

**Phase 2** — Native executable (exe/tar), air-gap support, fine-tuned local model

**Phase 3** — Unified platform, multi-LLM orchestration, enterprise analytics

---

## Contributing

This is an early beta. Issues and PRs welcome.

---

## Support

Ouroboros is free. If it saves you time, consider supporting it:
- [PayPal](https://paypal.me/ouroboros)
- [Card via Stripe](https://donate.stripe.com/ouroboros)
