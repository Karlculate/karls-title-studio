# Karl's Title Studio — OpenAI-powered edition

Enter a product name. The Netlify Function calls the OpenAI Responses API with the built-in `web_search` tool. OpenAI researches the product and generates up to 15 distinct promotional title ideas in the requested style. The page displays only the title ideas, with Copy, Copy all and New batch controls.

## Netlify environment variables
Set these in Site configuration / Environment variables, then trigger a fresh deploy:
- `OPENAI_API_KEY` = your secret API key
- `OPENAI_MODEL` = `gpt-4.1-mini`

Do not put the API key in `index.html` or commit it to GitHub.

## Netlify build settings
- Base directory: blank
- Package directory: blank
- Build command: blank
- Publish directory: `.`
- Functions directory: `netlify/functions`

## Free-credit-only usage warning
The app does not purchase credits or enable auto-recharge. It sends API requests only when the API key is configured. However, the app cannot inspect or restrict the API organization's credit balance. To avoid paid usage, do not add a payment method or purchase API credits; if you already have one, ensure Auto Recharge is OFF and understand that any existing paid balance may be consumed. When promotional/free credits are exhausted, requests should fail and the app will show the error rather than switching to generic template titles. Verify this behavior against your API billing page before sharing the site.

OpenAI API usage and web-search tool calls may consume API credits. See current API pricing and billing documentation.
