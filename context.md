# Ouroboros — Project Context
**Last updated: 27 February 2026**
**Status: Active development — beta launch target 10 March 2026**

---

## Overview

**Ouroboros** is a browser extension that improves AI prompts before they're sent. It intercepts a user's raw prompt, applies prompt engineering best practices (XML structuring, role-setting, chain-of-thought, specificity), and returns an improved version via an LLM — with a mandatory human approval gate before anything is sent.

**Papercargo** is the parent brand/company. `papercargo.com` is the main website. Ouroboros lives at `papercargo.com/ouroboros`. Papercargo also offers AI consultation and automation services. The tagline for Ouroboros is **"Prompt. Smarter."**

The name "Ouroboros" (the snake eating its own tail) is intentional — the product uses AI to improve AI prompts. The metaphor is literal.

---

## Brand & Design

| Property | Value |
|---|---|
| Primary colour | `#080B2A` (deep navy) |
| Accent | `#C8FF00` (acid green / `#b4ff64` in extension) |
| Iris / purple | `#5B5BD6` |
| Off-white | `#F0EEE8` |
| Display font (web) | Instrument Serif |
| Body font (web) | Barlow |
| Mono font | DM Mono |
| Display font (extension) | Bebas Neue / custom var |
| Extension accent | `#b4ff64` |
| Logo mark | ✳ asterisk / ouroboros snake SVG |
| Favicon | ✳ on `#080B2A` background, inline SVG |

**Nav logo** (both pages): `PAPERCARGO ✳` in text — not an image. The `logo.png` asset was too faint against the off-white background. The asterisk gets `color: var(--iris)` on hover.

---

## Repository & Deployment

- **GitHub**: Private repo (user manages)
- **Hosting**: Vercel — auto-deploys on push to `main`
- **Domain**: `papercargo.com`
- **Structure**:
```
papercargo.com/
├── index.html              ← Papercargo main landing page
├── privacy.html            ← Privacy policy
├── logo.png
├── orbit-bg.png
├── vercel.json
└── ouroboros/
    ├── index.html          ← Ouroboros product landing page
    ├── logo.png
    └── orbit-bg.png
```

**`vercel.json`** at root:
```json
{
  "rewrites": [
    { "source": "/ouroboros", "destination": "/ouroboros/index.html" },
    { "source": "/ouroboros/(.*)", "destination": "/ouroboros/$1" }
  ]
}
```

---

## Supabase

- **Project URL**: `https://igwbzpdtyuyowzgbissj.supabase.co`
- **Anon key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlnd2J6cGR0eXV5b3d6Z2Jpc3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNzM4ODMsImV4cCI6MjA4NzY0OTg4M30.z19H30GlmM75erma1V9yIdQLdC-BGE9kGiZ7AS1m-KI`
- **Region**: EU

### Tables

**`ouroboros_waitlist`**
- `email` (unique), `use_case`, `plan`
- RLS: anon can insert, no reads
- Trigger: `on_waitlist_signup` → auto-generates a license key in `ouroboros_licenses`

**`ouroboros_events`** (anonymous telemetry, opt-in)
- `session_id`, `event_type`, `backend`, `complexity`, `provenance`, `inference_layer`
- `original_length`, `improved_length`, `action`, `time_to_decision_ms`
- RLS: anon can insert only

**`ouroboros_prompts`** (prompt content, separate opt-in)
- `session_id`, `original_prompt`, `improved_prompt`, `changes` (jsonb), `complexity`, `backend`, `approved`
- RLS: anon can insert only

**`ouroboros_licenses`**
- `id`, `email`, `license_key`, `license_type`, `valid_from`, `valid_until`, `activated_at`, `is_active`
- License key format: `OBR-XXXX-XXXX-XXXX` (uppercase alphanumeric)
- RLS: anon can read (for verification), service role can write
- Trigger: auto-populated on `ouroboros_waitlist` insert

**`ouroboros_config`** (remote config)
- `key`, `value`, `updated_at`
- RLS: anon can read, service role writes
- Current rows:
  - `launch_date` → `2026-03-10`
  - `beta_active` → `true`
  - `free_daily_limit` → `5`

**Important SQL — backfill existing waitlist emails with license keys:**
```sql
insert into ouroboros_licenses (email, license_key, license_type, valid_from, valid_until)
select
  email,
  'OBR-' ||
    upper(substring(md5(random()::text) from 1 for 4)) || '-' ||
    upper(substring(md5(random()::text) from 1 for 4)) || '-' ||
    upper(substring(md5(random()::text) from 1 for 4)),
  'beta',
  now(),
  now() + interval '1 year'
from ouroboros_waitlist
where email not in (select email from ouroboros_licenses);
```

---

## Extension — File Structure

```
ouroboros/
├── manifest.json
├── background/
│   └── service-worker.js       ← LLM routing, Supabase telemetry, license/usage enforcement
├── content/
│   ├── content.js              ← Entry point injected into pages
│   ├── interceptor.js          ← Captures textarea / contenteditable text
│   ├── drawer-injector.js      ← Creates and manages the iframe drawer
│   └── provenance.js           ← Tracks typed vs pasted vs auto-populated
├── core/
│   ├── storage.js              ← Chrome storage helpers, DEFAULT_CONFIG
│   ├── router.js               ← Complexity routing (none/low/medium/high)
│   ├── optimizer.js            ← System prompt, LLM call orchestration
│   ├── diff.js                 ← Word-level diff algorithm
│   ├── license.js              ← Key verification, remote config, 24h cache
│   ├── usage.js                ← Daily counter, midnight reset, copy protection
│   └── openrouter-models.js    ← Curated model list (reference, inlined in onboarding)
├── adapters/
│   ├── index.js                ← BACKENDS array export
│   ├── base.js                 ← BaseAdapter class
│   ├── openrouter.js           ← OpenRouter (default backend)
│   ├── openai.js               ← Direct OpenAI
│   ├── anthropic.js            ← Direct Anthropic
│   ├── azure.js                ← Azure OpenAI (enterprise)
│   └── ollama.js               ← Local Ollama
├── drawer/
│   ├── drawer.html             ← Drawer UI (iframe)
│   ├── drawer.js               ← Drawer orchestrator
│   └── drawer.css              ← Drawer styles
├── onboarding/
│   ├── onboarding.html         ← 4-step setup flow
│   └── onboarding.js           ← Fully self-contained (no imports)
├── styles/
│   └── shared.css              ← CSS variables and base styles
└── assets/
    └── icons/                  ← 16, 32, 48, 128px PNGs needed for store submission
```

---

## Extension — Core Architecture

### Message types (content ↔ background)

| Message | Direction | Purpose |
|---|---|---|
| `OPTIMIZE_PROMPT` | content → background | Run optimization, returns result + trial flags |
| `ACCEPT_IMPROVEMENT` | content → background | Increment daily usage count |
| `GET_STATUS` | content → background | Fetch live usage/license state |
| `VERIFY_LICENSE` | content → background | Verify OBR key against Supabase |
| `LOG_EVENT` | content → background | Fire-and-forget analytics |
| `GET_CONFIG` | content → background | Read stored config |
| `OPEN_ONBOARDING` | content → background | Open onboarding tab |
| `CLEAR_LICENSE_CACHE` | content → background | Invalidate cached license |
| `OUROBOROS_GET_PROMPT` | drawer → content | Request current prompt context |
| `OUROBOROS_APPLY_PROMPT` | drawer → content | Insert improved prompt into field |
| `OUROBOROS_CLOSE_DRAWER` | drawer → content | Close the drawer |
| `OUROBOROS_RESET_PAGE` | drawer → content | Reload the page |
| `OUROBOROS_CONTEXT` | content → drawer | Send prompt + provenance + platform |

### Storage keys (`chrome.storage.sync`)
- `backend`, `apiKey`, `configured`, `onboardingComplete`
- `ollamaEndpoint`, `ollamaModel`
- `azureEndpoint`, `azureDeployment`, `azureApiVersion`
- `openrouterModel` (default: `mistralai/mistral-7b-instruct:free`)
- `shareAnonymousData`, `sharePromptContent`
- `licenseKey`, `licenseEmail`

### Storage keys (`chrome.storage.local`)
- `usage_YYYY_M_D` — daily count, auto-resets by date key
- `retryQueue` — failed Supabase inserts (max 100, dropped after 5 attempts)
- `remoteConfig` — cached Supabase config (24h TTL)
- `licenseStatus` — cached license verification (24h TTL)
- `auditLog` — local event log (max 500 entries)
- `promptLibrary` — saved prompts array

---

## Extension — Key Behaviours

### Onboarding flow (4 steps)
1. **Backend selection** — OpenRouter (default), Ollama, OpenAI, Anthropic, Azure. Connection test fires a real optimization call.
2. **Privacy** — Two separate toggles: anonymous usage data (metadata only) and prompt content sharing (separate opt-in, for training data).
3. **License key** — Email + `OBR-XXXX-XXXX-XXXX` entry. Beta testers get unlimited for 1 year. Skip goes to free tier.
4. **Done** — Extension is active.

### Freemium model
- **Before 10 March 2026** (`launch_date` in Supabase): no hard limits, open beta
- **After launch date**:
  - Free tier: 5 improvements/day (configurable via `free_daily_limit` in Supabase)
  - Count increments **only on accept** ("Use this" button), not on optimize
  - 5th (last) free use: text is `user-select: none`, copy event blocked, edit textarea is `readOnly`, orange warning banner shown
  - After 5th accept: paywall slides in with live midnight countdown
  - Licensed users (beta key): unlimited, green "✦ Beta — unlimited" badge
- **Upgrade CTA**: links to `papercargo.com/ouroboros#pricing` (Stripe page — pending)

### Daily limit reset
Uses date-keyed local storage (`usage_2026_3_10`). Naturally resets at midnight local time as the date key changes. No cron needed.

### Copy/paste protection (trial last use)
On the 5th free optimization result:
- `improved-text` div: `user-select: none`, `copy` event preventDefault
- `edit-textarea`: `readOnly = true`, opacity 0.5
- Diff view: `user-select: none`
- User can still click "Use this" to apply to the active text field — they just can't copy/paste it elsewhere

### Provenance tracking
Runs entirely client-side in `provenance.js`. Detects:
- `typed` — user typed content
- `pasted` — native paste event or content delta jump >20 chars
- `auto-populated` — field populated without user interaction
- `mixed` — combination
Shows a yellow warning flag in the drawer for pasted/mixed/auto-populated content.

### Retry queue
Failed Supabase inserts (network errors) queue in `chrome.storage.local.retryQueue`. Flushed on `chrome.runtime.onStartup` and on extension update. Items dropped after 5 failed attempts.

---

## Drawer UI

**Header**: Logo + "ouroboros" title | Platform badge | Reload button (↺) | Close button (✕)
- Reload button sends `OUROBOROS_RESET_PAGE` → content script reloads the page (fixes provenance state issues between prompts)

**Tabs**: Optimize | Library
- Settings is NOT a tab — accessible via "⚙ Settings" button in the empty state

**Optimize view**:
1. Provenance warning flag (hidden unless pasted/mixed)
2. Prompt preview (current text in focused field)
3. "Improve prompt" button (disabled until field focused + configured)
4. Paywall block (hidden unless limit reached)
5. Result area (hidden until result arrives):
   - Complexity badge + change count
   - Last-use warning (orange, trial only)
   - Result tabs: Improved | Diff | Edit
   - Changes list
   - Reasoning
   - Approval gate: **✓ Use this** | **Use original** | **Save to library**
6. Empty state with ⚙ Settings link

**Settings view** (not a tab — shown programmatically):
- Backend info + "Change setup" → opens onboarding
- License badge (beta) or free tier usage + upgrade link
- Data sharing toggles
- "Clear all data & reconfigure" (danger button)
- Privacy policy link → `papercargo.com/privacy`

---

## Backends / Adapters

| Backend | ID | Key required | Notes |
|---|---|---|---|
| OpenRouter | `openrouter` | Yes (`sk-or-...`) | Default. Model selector in onboarding. Default model: `mistralai/mistral-7b-instruct:free` |
| Ollama | `ollama` | No | Local. Auto-detects models via `/api/tags`. Default endpoint: `http://localhost:11434` |
| OpenAI | `openai` | Yes (`sk-...`) | Direct API |
| Anthropic | `anthropic` | Yes (`sk-ant-...`) | Direct API |
| Azure OpenAI | `azure` | Yes | Requires endpoint + deployment name |

### OpenRouter model options
**Free tier**: Mistral 7B Instruct, Llama 3.2 3B, Gemma 3 4B, Llama 3.3 70B
**Paid tier**: GPT-4o Mini, GPT-4o, Claude Haiku, Mistral Small 3.1 24B

---

## Website Pages

### `papercargo.com` (main)
Design: editorial/architectural, light off-white background, Instrument Serif headlines, asymmetric grid hero.
Sections: Hero | Ticker | Services (3 cards) | Ouroboros product spotlight | Philosophy (4 beliefs) | Contact | Footer

### `papercargo.com/ouroboros` (product)
Design: dark navy, cosmic/orbital, Bebas Neue headlines.
Sections: Hero with orbit ring | Before/After demo | How it works | Platform strip | Waitlist form (→ Supabase) | Enterprise contact | Footer

### `papercargo.com/privacy`
Design: matches Papercargo brand, sticky sidebar with scroll-aware nav highlighting.
Sections: TL;DR card (navy) | 10 numbered sections | Data tables with opt-in status pills
Both pages link here. Chrome Web Store requires this URL to be live before submission.

---

## Roadmap

### Current: v1.0 Beta (target: 10 March 2026)
- [x] Extension shell + manifest
- [x] Content scripts (interceptor, provenance, drawer injector)
- [x] All 5 adapters
- [x] Drawer UI with diff view, approval gate, prompt library
- [x] Onboarding (4 steps)
- [x] Supabase telemetry (events + prompt content)
- [x] Remote config via Supabase
- [x] License key system (OBR-XXXX-XXXX-XXXX)
- [x] Daily usage counter + freemium enforcement
- [x] Copy/paste protection on last free use
- [x] Paywall with countdown
- [x] papercargo.com live
- [x] Privacy policy live
- [ ] AI chatbot on website (step 5)
- [ ] Stripe payment page (step 6)
- [ ] Extension icons (16, 32, 48, 128px)
- [ ] Edge Add-ons submission
- [ ] Chrome Web Store submission

### v1.1 (post-launch)
- Supabase usage count sync (currently local only)
- OpenRouter model selector improvements
- Azure config UX improvements (API version dropdown, better errors)
- Email delivery of license keys to beta testers
- Stripe webhook → auto-generate license key on payment

### v1.2 (planned)
- **Iterative refinement** ("Refine further" button) — each pass counts as one daily use, diff shows pass N vs N-1, stops after pass 3
- WASM local inference layer
- Prompt analytics dashboard

### Phase 2 (future)
- Local executable (Electron/Tauri)
- Unified platform across all Papercargo products

---

## Known Issues & Notes

1. **Extension context invalidated** — Chrome MV3 service worker restarts. Not a code bug — resolves on next use. No fix needed.

2. **Provenance flag persists between prompts** — if user optimizes, reloads without closing the drawer, the provenance state from the previous prompt can linger. The reload button (↺) in the drawer header is the fix — it reloads the page and resets all state.

3. **No inline scripts in extension HTML** — Chrome CSP blocks them. All JS must be in external files. The paywall countdown timer was moved from an inline `<script>` block into `drawer.js` → `startResetCountdown()` for this reason.

4. **`onboarding.js` is self-contained** — no ES module imports. All helpers (BACKENDS, storage, Ollama ping) are inlined. This was deliberate to avoid bundler complexity during beta.

5. **License cache TTL is 24h** — if a key is deactivated in Supabase, the user won't be blocked for up to 24h. Acceptable for beta.

6. **`chrome.storage.session`** used for `sessionId`. Falls back to `crypto.randomUUID()` if unavailable (e.g. in service worker context edge cases).

---

## Contacts & Links

| Resource | URL |
|---|---|
| Website | https://papercargo.com |
| Ouroboros page | https://papercargo.com/ouroboros |
| Privacy policy | https://papercargo.com/privacy |
| Supabase dashboard | https://supabase.com/dashboard/project/igwbzpdtyuyowzgbissj |
| OpenRouter models | https://openrouter.ai/models |
| Edge Add-ons dashboard | https://partner.microsoft.com/dashboard |
| Chrome Web Store | https://chrome.google.com/webstore/devconsole |
| Contact | hello@papercargo.com |
