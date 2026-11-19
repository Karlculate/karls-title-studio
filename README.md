# Karl's Title Studio — Marketing Copy Edition

## What it generates from one product name
- 10 promotional headlines (catchy, persuasive ad hooks)
- 10 supporting taglines
- Up to 10 SEO-friendly Amazon listing titles, each at most 60 characters
- Public search result links and research notes

## Netlify deployment
Deploy the contents of this `amazon-title-generator` folder as the site root.

Netlify build settings:
- Base directory: blank
- Package directory: blank
- Build command: blank
- Publish directory: `.`
- Functions directory: `netlify/functions`

Keep `index.html`, `netlify.toml`, and `netlify/functions/research-generate.js` in these exact locations.

## Free mode and limitations
The default path attempts public search providers from a Netlify Function, then drafts marketing copy locally. Public search providers can block or rate-limit automated requests. When research is sparse, local promotional lines are generic and must not be mistaken for verified product benefits. Always review the source links and confirm product claims.

## Optional AI
AI is disabled unless `ENABLE_AI=true` and `OPENAI_API_KEY` are configured in Netlify environment variables. API calls may incur charges; only enable after confirming a free promotional credit balance and no paid fallback.
