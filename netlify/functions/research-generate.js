const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const reply = (statusCode, payload) => ({ statusCode, headers, body: JSON.stringify(payload) });
const clean = s => String(s || '').replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
const decode = s => String(s || '').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
function strip(html) { return decode(String(html || '').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim(); }
function ddgUrl(href) {
  try { const u = new URL(decode(href), 'https://html.duckduckgo.com'); const target = u.searchParams.get('uddg'); return target && /^https?:\/\//i.test(target) ? target : u.href; } catch { return ''; }
}
async function searchWeb(product) {
  const q = encodeURIComponent(`"${product}" specifications features official`);
  const url = `https://html.duckduckgo.com/html/?q=${q}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KarlsTitleStudio/1.0)', 'Accept': 'text/html' }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Free search provider returned ${res.status}`);
  const html = await res.text();
  const results = [];
  const blocks = html.split(/result__body/).slice(1);
  for (const block of blocks) {
    const link = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const snippet = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)>/i);
    if (!link) continue;
    const href = ddgUrl(link[1]);
    const title = strip(link[2]);
    const text = strip(snippet?.[1] || '');
    if (href && title && !/duckduckgo\.com/i.test(href)) results.push({ title, url: href, snippet: text });
    if (results.length >= 7) break;
  }
  return results;
}
function deriveFeatures(results, product) {
  const corpus = results.map(r => `${r.title}. ${r.snippet}`).join(' ');
  const phrases = [];
  const patterns = [
    /\b(USB[- ]?C|Bluetooth\s*[\d.]*|Wi[- ]?Fi\s*[\d.]*|4K|1080p|5G|2\.4GHz|wireless|cordless|rechargeable|waterproof|water resistant|noise cancelling|noise-cancelling|foldable|portable|reusable|stainless steel|ceramic|silicone|LED|touchscreen|adjustable|heated|magnetic|hands[- ]free|multi[- ]purpose|ergonomic|dishwasher safe|BPA[- ]free)\b/gi,
    /\b(\d+(?:\.\d+)?\s?(?:W| watt| watts|mAh|Ah|V| volt| volts| inch| inches| mm| cm| ml| L| oz| lb| lbs| hours?| hrs?| speeds?| settings?| modes?))\b/gi
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
  for (const f of features) {
    add(`${product} with ${f}`);
    add(`${product} ${f}`);
    add(`${f} ${product}`);
  }
  const endings = ['for Everyday Use','for Home and Travel','Portable Everyday Essential','Practical Daily Use','Convenient Everyday Design','for Daily Convenience'];
  endings.forEach(e => add(`${product} ${e}`));
  // Listing-title drafts stay product-led and never invent a benefit or specification.
  const base = pool.filter(x => x.toLowerCase().startsWith(product.toLowerCase()));
  return base.slice(0, count);
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
  let results = [], searchError = '';
  try { results = await searchWeb(product); } catch (e) { searchError = e.message; }
  const {features,keywords} = deriveFeatures(results, product);
  const research = { summary: results.length ? `Found ${results.length} public search results for “${product}”. Search snippets are preliminary evidence; confirm exact model and variant on the linked pages.` : `The free search source did not return usable results${searchError ? ` (${searchError})` : ''}. Titles are based on the product name only; no specifications have been verified.`, productType: results[0]?.title || product, features, keywords, sources: results.map(({title,url})=>({title,url})), searchAvailable: results.length > 0 };
  let titles = null, mode = 'free-search';
  try { titles = await optionalAI(product,research,count,limit); if (titles) mode='optional-ai'; } catch (e) { research.aiNote = `AI enhancement unavailable; used free title drafting instead (${e.message}).`; }
  if (!titles) titles = localTitles(product,features,count,limit);
  return reply(200,{productType:research.productType,summary:research.summary,features,keywords,titles,sources:research.sources,mode,aiNote:research.aiNote || '',searchAvailable:research.searchAvailable});
};
