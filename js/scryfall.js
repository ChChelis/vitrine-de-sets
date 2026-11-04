// Cliente do Scryfall: fila única com intervalo mínimo, Accept explícito, retry em 429/5xx.
// Regras: https://scryfall.com/docs/api (50 a 100 ms entre chamadas, cache, atribuição, não redistribuir imagens).
const API = 'https://api.scryfall.com';
const GAP = 100;
let last = 0, chain = Promise.resolve();

function throttled(fn) {
  const p = chain.then(async () => {
    const wait = last + GAP - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    try { return await fn(); } finally { last = Date.now(); }
  });
  chain = p.catch(() => {});
  return p;
}

export class ScryfallError extends Error {
  constructor(msg, status) { super(msg); this.status = status; }
}

async function getJson(url, tries = 4) {
  for (let i = 0; ; i++) {
    let r;
    try { r = await throttled(() => fetch(url, { headers: { Accept: 'application/json;q=0.9,*/*;q=0.8' } })); }
    catch (e) { if (i >= tries - 1) throw new ScryfallError('Sem conexão com o Scryfall', 0); await sleep(800 * (i + 1)); continue; }
    if (r.ok) return r.json();
    if ((r.status === 429 || r.status >= 500) && i < tries - 1) { await sleep(1500 * (i + 1)); continue; }
    let d = null; try { d = await r.json(); } catch {}
    throw new ScryfallError((d && d.details) || 'Erro ' + r.status, r.status);
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function getSet(code) {
  try { return await getJson(`${API}/sets/${encodeURIComponent(code)}`); }
  catch (e) { if (e.status === 404) throw new ScryfallError('Edição "' + code.toUpperCase() + '" não existe no Scryfall', 404); throw e; }
}

export async function searchSet(code, onPage) {
  let url = `${API}/cards/search?` + new URLSearchParams({ q: 'e:' + code, unique: 'prints', include_extras: 'true', include_variations: 'true', order: 'set' });
  const out = [];
  while (url) {
    const d = await getJson(url);
    out.push(...d.data);
    if (onPage) onPage(out.length, d.total_cards);
    url = d.has_more ? d.next_page : null;
  }
  return out;
}

export async function getIconSvg(uri) {
  try { const r = await throttled(() => fetch(uri)); return r.ok ? await r.text() : null; } catch { return null; }
}

// Carta do Scryfall -> registro do app (mesmos campos de antes, mais texto, custo e imagens).
export function entry(c) {
  const f = c.card_faces || [];
  const im = c.image_uris || (f[0] && f[0].image_uris);
  if (!im) return null;
  const tags = [...(c.frame_effects || []), ...(c.promo_types || [])];
  if (c.full_art) tags.push('fullart');
  if (c.border_color === 'borderless' && !tags.includes('borderless')) tags.push('borderless');
  if (c.frame === '1997' && !tags.includes('retro')) tags.push('retro');
  const col = (c.colors || (f[0] && f[0].colors) || []).join('');
  const back = c.image_uris ? null : (f[1] && f[1].image_uris && (f[1].image_uris.normal || f[1].image_uris.small));
  const join = k => c[k] != null ? c[k] : f.map(x => x[k]).filter(v => v != null && v !== '').join('\n//\n');
  return {
    dv: 2, id: c.id, set: c.set, name: c.name, num: c.collector_number, rar: c.rarity, fin: c.finishes,
    type_line: c.type_line || '', ci: (c.color_identity || []).join(''), produced: c.produced_mana || [],
    tags: [...new Set(tags)].sort(), col, type: (c.type_line || '').slice(0, 60), cmc: c.cmc || 0,
    layout: c.layout, released: c.released_at, lang: c.lang, ptbr: null,
    mana_cost: join('mana_cost'), oracle_text: join('oracle_text'), keywords: c.keywords || [],
    power: c.power != null ? c.power : (f[0] && f[0].power) || null,
    toughness: c.toughness != null ? c.toughness : (f[0] && f[0].toughness) || null,
    img: im.small || im.normal, hi: im.normal || im.small, back,
  };
}

const nk = n => { const d = String(n).replace(/\D/g, ''); return d ? d.padStart(5, '0') : '0'; };
export const sortCards = list => list.sort((a, b) => nk(a.num).localeCompare(nk(b.num)) || String(a.num).localeCompare(String(b.num)));

// Baixa a edição inteira. Devolve {meta, cards, total}; quem chama mescla com o que já existe.
export async function fetchSet(code, onProgress) {
  code = code.trim().toLowerCase();
  if (!/^[a-z0-9]{2,6}$/.test(code)) throw new ScryfallError('Sigla inválida (use 2 a 6 letras ou números)', 0);
  onProgress && onProgress('Buscando edição…');
  const s = await getSet(code);
  const raw = await searchSet(code, (n, t) => onProgress && onProgress(`Baixando cartas ${n}${t ? ' de ' + t : ''}…`));
  const cs = sortCards(raw.map(entry).filter(Boolean));
  const svg = await getIconSvg(s.icon_svg_uri);
  return { meta: { code, name: s.name, released: s.released_at, total: s.card_count, icon: svg }, cards: cs };
}
