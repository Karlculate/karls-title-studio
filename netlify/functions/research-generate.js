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
    /\b(USB[- ]?C|Bluetooth\s*[\d.]*|Wi[- ]?Fi\s*[\d.]*|4K|1080p|5G|2\.4GHz|wireless|cordless|rechargeable|waterproof|water resistant|noise cancelling|noise-cancelling|foldable|portable|reusable|stainless steel|ceramic|silicone|LED|touchscreen|adjustable|heated|magnetic|hands[- ]free|multi[- ]purpose|ergonomic|dishwasher safe|BPA[- ]free|AI tracking|object tracking|face tracking|3-axis|three-axis|gimbal stabilization|stabilization)\b/gi,
    /\b(\d+(?:\.\d+)?\s?(?:W| watt| watts|mAh|Ah|V| volt| volts| inch| inches| mm| cm| ml| L| oz| lb| lbs| hours?| hrs?| speeds?| settings?| modes?| kg| g))\b/gi
  ];
  for (const p of patterns) for (const m of corpus.matchAll(p)) { const v = clean(m[0]); if (!phrases.some(x => x.toLowerCase() === v.toLowerCase())) phrases.push(v); }
  const stop = new Set(['product','official','features','specifications','specification','review','reviews','amazon','buy','price','model','best','with','from','this','that','your','more','about','into','the','and','for','new','all']);
  const words = (corpus.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) || []).filter(w => !stop.has(w) && !product.toLowerCase().includes(w));
  const freq = new Map(); words.forEach(w => freq.set(w, (freq.get(w) || 0) + 1));
  const keyword = [...freq.entries()].sort((a,b)=>b[1]-a[1]).map(x=>x[0]).slice(0,8);
  return { features: phrases.slice(0,10), keywords: keyword };
}
function localTitles(product, features, count, limit) {
  const pool = [];
  const add = s => { s = clean(s).replace(/[|•]/g, ' '); if (s.length <= limit && !pool.includes(s)) pool.push(s); };
  add(product);
  for (const f of features) { add(`${product} with ${f}`); add(`${product} ${f}`); }
  const endings = ['for Everyday Use','Portable Everyday Essential','with Practical Design','for Home and Travel','Easy to Use Design','for Daily Use'];
  endings.forEach(e => add(`${product} ${e}`));
  return pool.slice(0,count);
}
async function optionalAI(product, research, count, limit) {
  if (process.env.ENABLE_AI !== 'true' || !process.env.OPENAI_API_KEY) return null;
  const prompt = `Create ${count} Amazon product title drafts for: ${product}. Maximum ${limit} characters each. Use only these search snippets and extracted details; never invent claims. Search notes: ${JSON.stringify(research)}. Keep product name near the beginning. Return JSON only: {"titles":[...]}`;
  const response = await fetch('https://api.openai.com/v1/responses', { method:'POST', headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'}, body:JSON.stringify({model:process.env.OPENAI_MODEL || 'gpt-4.1-mini',input:prompt}), signal:AbortSignal.timeout(25000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `AI service returned ${response.status}`);
  const textOut = data.output_text || (data.output || []).flatMap(x=>x.content || []).filter(x=>x.type==='output_text').map(x=>x.text).join('\n');
  const parsed = JSON.parse(textOut.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim());
  const titles = [...new Set((parsed.titles || []).map(clean).filter(t=>t && t.length<=limit))].slice(0,count);
  return titles.length ? titles : null;
}
exports.handler = async event => {
  if (event.httpMethod !== 'POST') return reply(405, { error:'Method Not Allowed' });
  let input; try { input = JSON.parse(event.body || '{}'); } catch { return reply(400,{error:'Invalid request.'}); }
  const product = clean(input.product).slice(0,160);
  if (!product) return reply(400,{error:'Enter a product name.'});
  const count = Math.max(1,Math.min(20,Number(input.count)||10));
  const limit = Math.max(30,Math.min(100,Number(input.limit)||60));
  const searched = await searchWeb(product);
  const results = searched.results;
  const {features,keywords} = deriveFeatures(results, product);
  const research = {
    summary: results.length
      ? `Found ${results.length} public search results via ${searched.provider} for “${product}”. Search snippets are preliminary evidence; confirm exact model and variant on linked pages.`
      : `Public search providers did not return usable results. ${searched.errors.join(' | ') || 'No matching results were parsed.'} No specifications have been verified.`,
    productType: results[0]?.title || product, features, keywords,
    sources: results.map(({title,url})=>({title,url})), searchAvailable: results.length > 0,
    searchProvider: searched.provider, searchDiagnostics: searched.errors
  };
  let titles = null, mode = 'free-search';
  try { titles = await optionalAI(product,research,count,limit); if (titles) mode='optional-ai'; }
  catch (e) { research.aiNote = `AI enhancement unavailable; used free title drafting instead (${e.message}).`; }
  if (!titles) titles = localTitles(product,features,count,limit);
  return reply(200,{productType:research.productType,summary:research.summary,features,keywords,titles,sources:research.sources,mode,aiNote:research.aiNote || '',searchAvailable:research.searchAvailable,searchProvider:research.searchProvider,searchDiagnostics:research.searchDiagnostics});
};
