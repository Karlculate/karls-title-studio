const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const reply = (statusCode, payload) => ({ statusCode, headers, body: JSON.stringify(payload) });
const clean = s => String(s || '').replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
const decode = s => String(s || '').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));
function strip(html) { return decode(String(html || '').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim(); }
function safeUrl(href, base) {
  try {
    const u = new URL(decode(href), base);
    const target = u.searchParams.get('uddg') || u.searchParams.get('url');
    const finalUrl = target && /^https?:\/\//i.test(target) ? target : u.href;
    return /^https?:\/\//i.test(finalUrl) && !/duckduckgo\.com|bing\.com\/.*\/aclick/i.test(finalUrl) ? finalUrl : '';
  } catch { return ''; }
}
async function getHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'
    },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error(`Search provider returned HTTP ${res.status}`);
  return await res.text();
}
function parseDuck(html, base) {
  const results = [];
  // Match anchors regardless of whether class or href appears first in the tag.
  const anchors = html.match(/<a\b(?=[^>]*\bclass=["'][^"']*(?:result__a|result-link)[^"']*["'])[^>]*>[\s\S]*?<\/a>/gi) || [];
  for (const a of anchors) {
    const href = a.match(/\bhref=["']([^"']+)["']/i)?.[1];
    const title = strip(a.replace(/<\/?a\b[^>]*>/gi,''));
    const url = safeUrl(href, base);
    if (url && title) results.push({title,url,snippet:''});
  }
  // Attach nearby snippets where available.
  for (let i=0;i<results.length;i++) {
    const idx = html.indexOf(results[i].title);
    const nearby = idx >= 0 ? html.slice(idx, idx+1800) : '';
    const m = nearby.match(/class=["'][^"']*(?:result__snippet|result-snippet)[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|td|div)>/i);
    if (m) results[i].snippet = strip(m[1]);
  }
  return results;
}
function parseBing(html) {
  const results = [];
  const blocks = html.match(/<li\b[^>]*class=["'][^"']*\bb_algo\b[^"']*["'][^>]*>[\s\S]*?<\/li>/gi) || [];
  for (const block of blocks) {
    const a = block.match(/<h2[^>]*>\s*<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    const url = safeUrl(a[1], 'https://www.bing.com');
    const title = strip(a[2]);
    const snippet = strip(block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '');
    if (url && title) results.push({title,url,snippet});
  }
  return results;
}
async function searchWeb(product) {
  const queries = [`"${product}" specifications features official`, `${product} official product specifications`];
  const providers = [
    {name:'DuckDuckGo HTML', run: async q => parseDuck(await getHtml(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`),'https://html.duckduckgo.com')},
    {name:'DuckDuckGo Lite', run: async q => parseDuck(await getHtml(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`),'https://lite.duckduckgo.com')},
    {name:'Bing', run: async q => parseBing(await getHtml(`https://www.bing.com/search?q=${encodeURIComponent(q)}`))}
  ];
  const errors = [];
  for (const provider of providers) {
    for (const query of queries) {
      try {
        const found = await provider.run(query);
        const unique = [...new Map(found.map(r=>[r.url,r])).values()].slice(0,7);
        if (unique.length) return {results:unique, provider:provider.name, errors};
      } catch (e) { errors.push(`${provider.name}: ${e.message}`); }
    }
  }
  return {results:[], provider:'', errors};
}
function deriveFeatures(results, product) {
  const corpus = results.map(r => `${r.title}. ${r.snippet}`).join(' ');
  const phrases = [];
  const patterns = [
    /\b(USB[- ]?C|Bluetooth\s*[\d.]*|Wi[- ]?Fi\s*[\d.]*|4K|1080p|5G|2\.4GHz|4[- ]in[- ]1|multi[- ]beam|UV|green beam|kinetic|sand art|zen|stress relief|wireless|cordless|rechargeable|waterproof|water resistant|noise cancelling|noise-cancelling|foldable|portable|reusable|stainless steel|ceramic|silicone|LED|touchscreen|adjustable|heated|magnetic|hands[- ]free|multi[- ]purpose|ergonomic|dishwasher safe|BPA[- ]free|AI tracking|object tracking|face tracking|3-axis|three-axis|gimbal stabilization|stabilization)\b/gi,
    /\b(\d+(?:\.\d+)?\s?(?:lumens?|lm|W| watt| watts|mAh|Ah|V| volt| volts| inch| inches| mm| cm| ml| L| oz| lb| lbs| hours?| hrs?| speeds?| settings?| modes?| kg| g))\b/gi
  ];
  for (const p of patterns) for (const m of corpus.matchAll(p)) { const v = clean(m[0]); if (!phrases.some(x => x.toLowerCase() === v.toLowerCase())) phrases.push(v); }
  const stop = new Set(['product','official','features','specifications','specification','review','reviews','amazon','buy','price','model','best','with','from','this','that','your','more','about','into','the','and','for','new','all']);
  const words = (corpus.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) || []).filter(w => !stop.has(w) && !product.toLowerCase().includes(w));
  const freq = new Map(); words.forEach(w => freq.set(w, (freq.get(w) || 0) + 1));
  const keyword = [...freq.entries()].sort((a,b)=>b[1]-a[1]).map(x=>x[0]).slice(0,8);
  return { features: phrases.slice(0,10), keywords: keyword };
}
function localMarketing(product, features, keywords, count=10) {
  const f = features.map(clean);
  const lower = product.toLowerCase();
  const category = /flashlight|torch/.test(lower) ? 'Flashlight'
    : /sand art/.test(lower) ? 'Sand Art Table'
    : /gimbal|stabilizer/.test(lower) ? 'Gimbal'
    : /headphone|earbud/.test(lower) ? 'Audio Essential'
    : /wallet/.test(lower) ? 'Wallet'
    : /camera/.test(lower) ? 'Camera'
    : /watch/.test(lower) ? 'Watch'
    : /table/.test(lower) ? 'Table'
    : /comb|straightener/.test(lower) ? 'Styling Tool'
    : (product.split(/\s+/).slice(-1)[0] || 'Product').replace(/[^\w-]/g,'');
  const feature = f.find(x => /\d/.test(x)) || f[0] || '';
  const titles = [];
  const add = t => { t=clean(t).replace(/\s+([!?.])/g,'$1'); if(t && !titles.some(x=>x.toLowerCase()===t.toLowerCase())) titles.push(t); };
  const shuffle = arr => {
    const a=[...arr];
    for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
    return a;
  };
  if (/flashlight|torch/.test(lower)) {
    [
      'One Flashlight, Four Powerful Lights!',
      'The Ultimate 4-in-1 EDC Flashlight!',
      'More Than a Flashlight – It’s 4 Tools in One!',
      `Brighten Every Adventure with ${product}!`,
      'The Pocket Flashlight Every Outdoor Lover Needs!',
      'Your Ultimate Camping & Emergency Flashlight!',
      'Small but Mighty! A Powerful EDC Flashlight!',
      'The Flashlight Built for Work, Camping & Emergencies!',
      'See More, Do More with This EDC Flashlight!',
      'One Pocket-Sized Light. So Many Possibilities!',
      'Light Up Your Next Adventure!',
      'Your Everyday Carry Just Got Brighter!',
      'A Powerful Light for Whatever Comes Your Way!',
      'Ready for the Trail, the Jobsite and the Unexpected!',
      'Big Performance in a Pocket-Friendly Design!',
      'The Compact Light That’s Ready for Anything!',
      'Take Powerful Illumination Wherever You Go!',
      'One Handy Light for Everyday Adventures!',
      'Make Darkness Less of a Challenge!',
      'Your Next Go-To Light for Work and Outdoors!'
    ].forEach(add);
  } else if (/sand art/.test(lower)) {
    [
      'This Tiny Sand Art Machine Is Pure Relaxation!',
      'Your Desk Needs This Mesmerizing Zen Gadget!',
      'I Could Watch This Moving Sand Art All Day!',
      'The Most Satisfying Desk Decor You’ll Ever See!',
      'Turn Your Desk Into a Mini Zen Garden!',
      'This Smart Sand Art Table Is Seriously Addictive!',
      'Need to Relax? Just Watch the Sand Move!',
      'The Coolest Stress Relief Gadget for Your Desk!',
      'Watch This Little Machine Create Endless Art!',
      'This Is the Ultimate Gift for Anyone Who Needs Zen!',
      'A Mini Masterpiece That Never Stops Mesmerizing!',
      'Your New Favorite Way to Unwind After Work!',
      'This Kinetic Sand Art Is Desk Goals!',
      'Hundreds of Sand Patterns at Your Fingertips!',
      'Warning: You Won’t Want to Stop Watching This!',
      'Bring a Little Calm to Your Workspace!',
      'A Mesmerizing Moment of Calm, Right on Your Desk!',
      'Turn Idle Moments Into Something Beautiful!',
      'The Desk Accessory You’ll Keep Watching!',
      'Give Your Workspace a More Relaxing Vibe!'
    ].forEach(add);
  } else {
    [
      `Meet Your New Favorite ${category}!`,
      `The ${category} You Didn’t Know You Needed!`,
      'Small Details. A Big Everyday Difference!',
      `Make Every Day Better with ${product}!`,
      `The ${category} Worth a Closer Look!`,
      `A Smarter Way to Enjoy Your ${category}!`,
      `One ${category}, So Many Possibilities!`,
      'This Might Be Your New Favorite Gadget!',
      'The Everyday Essential That Stands Out!',
      `Give Your Daily Routine a Fresh Upgrade!`,
      `Discover a New Favorite with ${product}!`,
      `The Handy ${category} You’ll Reach For Again and Again!`,
      `A Clever Little Upgrade for Everyday Life!`,
      `Make Room for Something More Useful!`,
      `Your Next Everyday Essential Starts Here!`,
      `A Practical Find You’ll Be Glad You Found!`,
      `Bring More Convenience to Your Day!`,
      `The ${category} That Makes You Look Twice!`,
      `Everyday Function Meets Fresh Possibilities!`,
      `Why Settle for Ordinary ${category}s?`
    ].forEach(add);
  }
  if (feature) {
    add(`${feature} – All in One!`);
    add(`Get More from ${feature}!`);
    add(`Discover the Power of ${feature}!`);
    add(`${feature} That Goes Wherever You Do!`);
  }
  // Return a genuinely different selection/order for each New batch request.
  return { titles: shuffle(titles).slice(0, Math.max(1, Math.min(20, Number(count)||10))) };
}
async function generateWithOpenAI(product, batchSeed) {
  if (!process.env.OPENAI_API_KEY) {
    const err = new Error('OpenAI is not configured. Add OPENAI_API_KEY in Netlify environment variables.');
    err.statusCode = 503; throw err;
  }
  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const prompt = `You are the product-marketing copywriter for Karl's Title Studio.

TASK
Research this exact product online, then write 15 distinct, catchy promotional title ideas:
${product}

STYLE REFERENCE
The user likes direct, punchy, curiosity-building e-commerce hooks like:
- One Flashlight, Four Powerful Lights!
- 1700 Lumens of Power in Your Pocket!
- The Ultimate 4-in-1 EDC Flashlight!
- More Than a Flashlight – It's 4 Tools in One!
- This Tiny Sand Art Machine Is Pure Relaxation!
- Your Desk Needs This Mesmerizing Zen Gadget!
- Warning: You Won't Want to Stop Watching This!

RESEARCH RULES
- Use web search to identify the exact product and its real features.
- Prefer the manufacturer's official product page, official manuals, and reputable retailer/product pages.
- Use product-specific features, numbers, functions, use cases and benefits only when supported by sources.
- Never invent specifications, lumen ratings, battery life, materials, compatibility, certifications, performance, awards or guarantees.
- If exact model details cannot be verified, avoid numeric/specification claims and write safe benefit-led hooks.
- Do not confuse similarly named models or variants.

WRITING RULES
- Return exactly 15 promotional title ideas, one title per line in the JSON array.
- Make the titles varied: feature-led, benefit-led, curiosity-led, use-case-led, gift-led when appropriate.
- Sound natural, persuasive, specific and human. Avoid generic filler and repeated sentence structures.
- Keep them concise and memorable. Exclamation marks are welcome but don't force one into every title.
- Do not return SEO listing titles, taglines, descriptions, explanations, categories, or separate sections.
- This is a fresh batch. Variation seed: ${batchSeed}. Explore different hooks and angles rather than reusing a predictable template.

OUTPUT
Return valid JSON only, with this exact shape:
{"titles":["title 1","title 2", "... 15 total"]}
`;
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      tools: [{ type: 'web_search', search_context_size: 'medium' }],
      tool_choice: 'required',
      max_output_tokens: 1400,
      input: prompt
    }),
    signal: AbortSignal.timeout(90000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data?.error?.message || `OpenAI API request failed (${response.status}).`);
    err.statusCode = response.status === 429 ? 429 : 502;
    throw err;
  }
  const outputText = data.output_text || (data.output || [])
    .flatMap(item => item.content || [])
    .filter(item => item.type === 'output_text')
    .map(item => item.text)
    .join('\n');
  let parsed;
  try {
    const cleaned = outputText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    const match = outputText.match(/\{[\s\S]*"titles"\s*:\s*\[[\s\S]*?\]\s*\}/);
    if (!match) throw new Error('The AI returned an unexpected format. Please try New batch.');
    parsed = JSON.parse(match[0]);
  }
  const titles = [...new Set((Array.isArray(parsed.titles) ? parsed.titles : [])
    .map(clean)
    .filter(title => title && title.length <= 220))]
    .slice(0, 15);
  if (titles.length < 8) throw new Error('The AI returned too few usable titles. Please try again.');
  const sources = [];
  for (const item of (data.output || [])) {
    for (const content of (item.content || [])) {
      for (const annotation of (content.annotations || [])) {
        if (annotation.type === 'url_citation' && annotation.url) {
          if (!sources.some(source => source.url === annotation.url)) {
            sources.push({ title: annotation.title || annotation.url, url: annotation.url });
          }
        }
      }
    }
  }
  return { titles, sources, model };
}
exports.handler = async event => {
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  let input;
  try { input = JSON.parse(event.body || '{}'); }
  catch { return reply(400, { error: 'Invalid request body.' }); }
  const product = clean(input.product).slice(0, 160);
  if (!product) return reply(400, { error: 'Enter a product name.' });
  const batchSeed = clean(input.batchSeed || input.batch || 'first batch').slice(0, 100);
  try {
    const result = await generateWithOpenAI(product, batchSeed);
    return reply(200, {
      titles: result.titles,
      sources: result.sources,
      searchAvailable: result.sources.length > 0,
      mode: 'OpenAI AI research + promotional title generation',
      model: result.model
    });
  } catch (error) {
    const status = error.statusCode || 502;
    const message = status === 429
      ? `OpenAI did not accept the request. Your free API credits may be exhausted, or a rate limit was reached. No template fallback was used. Details: ${error.message}`
      : error.message || 'AI title generation failed.';
    return reply(status, { error: message, aiRequired: true });
  }
};
