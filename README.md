# Humanizer — Cloudflare Pages

The same markdown-safe AI text humanizer, ported to **Cloudflare Pages + Workers AI**.

## What's different from the Flask version

| | Flask version | This (Pages) version |
|---|---|---|
| Backend | Python Flask | JavaScript Pages Function |
| Hosting | Your own server | Cloudflare Pages (free) |
| Free LLM included | ❌ Always need API key | ✅ Cloudflare Workers AI default |
| Frontend | Identical | Identical |
| Markdown preservation | ✅ | ✅ |
| All other features | ✅ | ✅ |

The **frontend is identical** — same UI, same dark/light theme, same edit/preview tabs, same pattern detection, same workflow. Only the backend implementation language changed.

## Project structure

```
humanizer-cf-pages/
├── public/                  # static frontend (served by Pages)
│   ├── index.html
│   ├── style.css
│   └── app.js
├── functions/api/           # serverless backend
│   └── rewrite.js           # JS port of Flask /rewrite endpoint
├── wrangler.toml            # Cloudflare config with AI binding
├── package.json             # for local dev
└── README.md
```

## Features

- **Free by default** — uses Cloudflare Workers AI (no API key needed)
- **Optional BYOK** — switch to OpenAI / Gemini / OpenRouter and supply your own key
- **Dark + light themes** with toggle (saved in localStorage)
- **Edit / Preview tabs** on both panes (Markdown renders via marked.js)
- **Markdown preservation** — code blocks, tables, headings, lists, blockquotes, front matter all protected
- **Per-sentence AI rewrites** with individual Apply buttons
- **3 rewrite modes** — conservative, natural, aggressive
- **No signup, no tracking**
- **Edge-fast** — runs globally on Cloudflare's network

## Cost

| Tier | What you get | Cost |
|------|--------------|------|
| Cloudflare Pages free | Unlimited static requests, 100k Function invocations/day | **$0** |
| Workers AI free | 10,000 neurons/day (resets at 00:00 UTC) | **$0** |

For typical humanizer use (300-token rewrites), 10K neurons = roughly **3,000-5,000 rewrites per day** for free. Above that, ~$0.011 per 1,000 additional requests on Pages and per-neuron rates on AI.

## Deploy — Option 1: GitHub + Cloudflare Dashboard (easiest)

1. Push this folder to GitHub
2. **Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git**
3. Select your repo
4. Build settings:
   - **Build command:** *(leave empty)*
   - **Build output directory:** `public`
   - **Root directory:** `/`
5. **Save and Deploy**
6. After the first deploy succeeds, go to **Settings → Functions → Bindings**
   - Click **Add binding → Workers AI**
   - Variable name: `AI`
   - Save
7. **Redeploy** (Deployments tab → ... → Retry deployment)

Live at `https://your-project.pages.dev`.

## Deploy — Option 2: Wrangler CLI

```bash
# Install wrangler globally if you haven't
npm install -g wrangler

# Authenticate
wrangler login

# Deploy
cd humanizer-cf-pages
npm install
npm run deploy
```

The `[ai]` binding in `wrangler.toml` is picked up automatically.

## Custom domain (e.g. humanize.adminschoice.com)

1. Pages project → **Custom domains → Set up a custom domain**
2. Enter `humanize.adminschoice.com`
3. Cloudflare auto-creates the DNS record if `adminschoice.com` is on Cloudflare
4. SSL provisions in ~1 minute

## Adding it to an existing WordPress site (adminschoice.com/tools/humanizer)

Two options:

**Option A — Subdomain (clean, recommended):**
- Deploy here, set custom domain `humanize.adminschoice.com`
- Link to it from your WordPress nav: "Free Tools → Humanizer"

**Option B — Subfolder via Cloudflare Workers route:**
- Create a Cloudflare Worker that proxies `adminschoice.com/tools/humanizer/*` to the Pages deployment
- Set the route in Cloudflare dashboard → your domain → Workers Routes

**Option C — iframe in a WordPress page (quick and dirty):**
- WP page at `/tools/humanizer/`
- Embed:
  ```html
  <iframe src="https://humanizer.pages.dev"
          width="100%" height="1400"
          frameborder="0" style="border:none;"></iframe>
  ```
- Less ideal for SEO; the tool URL won't rank, only the WP page will

## Local development

```bash
npm install
npm run dev
# → http://localhost:8788
```

Note: local dev with Workers AI binding requires `wrangler pages dev --ai AI` (already set in the npm script). Some Workers AI models work only against the remote runtime — if you hit issues locally, deploy to a preview environment instead with `npm run deploy`.

## Available Workers AI models

These are the models the backend will accept (others are normalized to the default):

| Model ID | Notes |
|----------|-------|
| `@cf/meta/llama-3.1-8b-instruct` | Fast, free, default |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Higher quality, may cost more neurons |
| `@cf/mistral/mistral-small-3.1-24b-instruct` | Balanced |
| `@cf/qwen/qwen2.5-coder-32b-instruct` | Strong on technical text |

For BYOK providers, type any model the provider supports.

## Recommended models for BYOK

| Provider | Default | Other good options |
|----------|---------|-------------------|
| OpenAI | `gpt-4.1-mini` | `gpt-4o-mini`, `gpt-4.1` |
| Gemini | `gemini-2.0-flash` | `gemini-2.5-flash`, `gemini-2.5-pro` |
| OpenRouter | `openai/gpt-4o-mini` | `anthropic/claude-3.5-haiku`, `qwen/qwen-2.5-72b-instruct` |

## Anti-abuse (recommended for production)

Public free tools attract scrapers. Two quick layers:

1. **Cloudflare Turnstile** (free CAPTCHA replacement) — add to the Humanize button
2. **Rate limiting** — Cloudflare's free tier includes basic rate limits per IP under Security settings

## Customization

- **Brand color** — edit `--accent` in `public/style.css` (`#f97316` dark / `#ea580c` light)
- **Default theme** — change `data-theme="dark"` in `index.html` or the `savedTheme || 'dark'` fallback in `app.js`
- **Long-sentence threshold** — change `> 28` in `app.js` (and add a matching constant in `functions/api/rewrite.js` if you want server-side enforcement)
- **Logo / brand name** — `.logo` element in `index.html`

## Privacy

- API keys (when BYOK is used) pass through the Cloudflare Function once and go straight to the provider — never stored.
- No analytics or tracking included by default. Add Cloudflare Web Analytics (free, privacy-friendly) if you want stats.
- The user's text is sent to the chosen AI provider only when they click "AI Rewrite". Pattern analysis and mechanical clean run fully in their browser.

## License

MIT — use freely.
