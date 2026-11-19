# Karl's Title Studio — automatic hybrid version

## What the user does
Enter a product name and click **Research & Generate Titles**. The Netlify function searches public web results, extracts possible product terms/specifications from result snippets, and generates 10 Amazon listing title drafts (maximum 60 characters). Source links appear with the research notes.

## Free mode
Free mode is the default. It uses DuckDuckGo's public HTML search endpoint from a Netlify Function and local title drafting. It does not require an OpenAI key. Public search providers may rate-limit, block, or change their HTML; when search is unavailable, the app clearly labels the fallback and does not claim specifications were verified.

## Optional AI mode
AI is OFF unless both environment variables are explicitly configured:
- `ENABLE_AI=true`
- `OPENAI_API_KEY=<your server-side API key>`

Only enable this when you have verified available promotional API credits and understand that the API may otherwise incur charges. The app cannot distinguish promotional credits from purchased balance or enforce a zero-spend limit. Keep the key in Netlify environment variables, never in the HTML. Optional model defaults to `gpt-4.1-mini`; override with `OPENAI_MODEL` if needed.

## Deploy to Netlify
1. Upload/connect the complete project folder to Netlify (not just `index.html`).
2. Ensure the site publishes the project root and the function directory is `netlify/functions` (see `netlify.toml`).
3. Deploy. No environment variables are required for free mode.
4. Test `https://YOUR-SITE.netlify.app/.netlify/functions/research-generate` with GET; a 405 response means the function route exists.
5. Open the site, enter a product name, and generate.

## Important
Search snippets are discovery evidence, not proof of every specification. Open the linked sources and verify exact model, bundle, and regional variant before publishing. The app creates drafts, not Amazon compliance approval or ranking guarantees.
