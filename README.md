# Karl's Title Studio

Deploy the entire `amazon-title-generator` folder as the Netlify site root. Keep `index.html`, `netlify.toml`, and `netlify/functions/research-generate.js` at the root-relative locations shown in the project.

Netlify build settings:
- Base directory: blank
- Package directory: blank
- Build command: blank
- Publish directory: `.`
- Functions directory: `netlify/functions`

The free research function tries DuckDuckGo HTML, DuckDuckGo Lite, and Bing HTML search in sequence. Search availability can vary by provider and network policy. The function only extracts candidate information from public result snippets; verify product specifications on source pages before using an Amazon listing.

Optional AI is disabled unless `ENABLE_AI=true` and `OPENAI_API_KEY` are configured. API usage may incur charges; only enable it if you have confirmed free promotional credits and no paid fallback.
