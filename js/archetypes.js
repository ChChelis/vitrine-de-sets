// Etiquetas por carta, mecânicas, tribos, arquétipos por par de cores e cartas parecidas.
// Tudo determinístico, sobre o texto de regras do Scryfall. As regras vivem em data/rules.json (dado editável).
// Referência original: tagger.py do handoff. Etiquetas são por NOME de carta (várias artes contam uma vez).

const COLORS = 'WUBRG';
let RULES = null;

export async function loadRules(url = 'data/rules.json') {
  if (RULES) return RULES;
  const j = await (await fetch(url)).json();
  RULES = compile(j);
  return RULES;
}

export function compile(j) {
  const rx = s => new RegExp(s);
  const lab = {};
  const regras = j.regras.map(r => { lab[r.tag] = r.rotulo; return { tag: r.tag, re: rx(r.regex), nao: r.regex_nao ? rx(r.regex_nao) : null }; });
  const tipos = j.tipos.map(r => { lab[r.tag] = r.rotulo; return { tag: r.tag, re: rx(r.regex_no_type_line) }; });
  Object.assign(lab, j.rotulos_extras);
  return {
    regras, tipos, lab, th: j.limiares,
    evergreen: new Set(j.evergreen_ignorar_como_mecanica),
    kw: Object.fromEntries(Object.entries(j.keywords_para_etiqueta).map(([t, a]) => [t, new Set(a)])),
  };
}

export function label(R, t) {
  if (t.startsWith('mec:')) return 'Mecânica ' + t.slice(4);
  if (t.startsWith('tribo:')) return 'Tribo ' + t.slice(6);
  return R.lab[t] || t;
}

const typeLine = c => c.type_line || c.type || '';
const oracle = c => c.oracle_text || '';
export const role = c => { const t = typeLine(c); return /\bLand\b/.test(t) && !/Creature/.test(t) ? 'terreno' : /Creature/.test(t) ? 'criatura' : 'mágica'; };

// minúsculas, sem texto-lembrete, com o nome da carta (e do primeiro nome / de cada face) trocado por ~
export function prep(c) {
  let t = oracle(c).toLowerCase();
  const names = new Set();
  for (const full of String(c.name).split(' // ')) {
    names.add(full.toLowerCase());
    const first = full.split(',')[0].toLowerCase();
    if (first.length >= 4) names.add(first);
  }
  for (const n of [...names].sort((a, b) => b.length - a.length)) t = t.split(n).join('~');
  return t.replace(/\([^)]*\)/g, ' ');
}

export function tagCard(c, R) {
  const txt = prep(c), tl = typeLine(c).toLowerCase(), tags = new Set();
  for (const r of R.regras) if (r.re.test(txt) && !(r.nao && r.nao.test(txt))) tags.add(r.tag);
  for (const r of R.tipos) if (r.re.test(tl)) tags.add(r.tag);
  const produced = c.produced || [];
  const creature = tl.includes('creature');
  // criatura de mana: o próprio texto dela tem "{T}: Add" (produced_mana do Scryfall inclui fichas e efeitos únicos)
  if (creature && produced.length && /\{t\}[^.\n]*: add \{/.test(txt.replace(/"[^"]*"/g, ' '))) { tags.add('mana_creature'); tags.add('ramp'); }
  if (tl.includes('land') && produced.length >= 2) tags.add('fixing');
  const pw = [c.power, c.toughness].some(x => /^\d+$/.test(x || '') && +x >= R.th.finalizador_pt);
  if (creature && (c.cmc >= R.th.finalizador_cmc || pw)) tags.add('finisher');
  // keyword só vale se aparece no texto da própria carta (o Scryfall também lista as de fichas e do texto-lembrete)
  for (const k of (c.keywords || []).map(x => x.toLowerCase()))
    if (txt.includes(k)) for (const t in R.kw) if (R.kw[t].has(k)) tags.add(t);
  if (tl.includes('land') && !creature) tags.delete('ramp');   // terreno que gira mana não é "mana extra"; a etiqueta dele é fixing
  return tags;
}

const subtypes = c => {
  const tl = typeLine(c).split(' // ')[0];      // só a primeira face
  return /Creature/.test(tl) && tl.includes('—') ? tl.split('—')[1].trim().split(/\s+/) : [];
};
const rarOrder = { mythic: 0, rare: 1, uncommon: 2, common: 3 };

export function analyze(prints, R) {
  const u = new Map();
  for (const c of prints) if (!u.has(c.name)) u.set(c.name, c);
  const cards = [...u.values()], by = new Map(cards.map(c => [c.name, c]));
  const tags = new Map(cards.map(c => [c.name, tagCard(c, R)]));
  const nonland = cards.filter(c => role(c) !== 'terreno').map(c => c.name);

  // mecânicas: palavra-chave não evergreen em N+ cartas
  const kwc = new Map();
  for (const c of cards) for (const k of new Set(c.keywords || [])) if (!R.evergreen.has(k.toLowerCase())) kwc.set(k, (kwc.get(k) || 0) + 1);
  const mecanicas = {};
  for (const [k, v] of kwc) if (v >= R.th.mecanica_min_cartas) mecanicas[k] = v;
  for (const c of cards) for (const k of c.keywords || []) if (k in mecanicas && k.toLowerCase() !== 'landfall') tags.get(c.name).add('mec:' + k);

  // tribos: subtipo com N+ criaturas e N+ cartas que o citam
  const sc = new Map();
  for (const c of cards) for (const s of new Set(subtypes(c))) if (s !== '//') sc.set(s, (sc.get(s) || 0) + 1);
  const tribos = {};
  for (const [s, v] of sc) {
    if (v < R.th.tribo_min_criaturas) continue;
    const re = new RegExp('\\b' + s.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + 's?\\b');
    const own = new RegExp('(?:other )?' + s.toLowerCase() + 's? (?:you control|creatures?)|for each ' + s.toLowerCase());
    const cita = new Set(cards.filter(c => {
      if (!re.test(prep(c))) return false;
      const isThat = typeLine(c).split('—')[0].includes(s);
      return !isThat || own.test(prep(c));
    }).map(c => c.name));
    if (cita.size >= R.th.tribo_min_citam) tribos[s] = { criaturas: v, cartas_que_citam: cita.size };
  }
  for (const c of cards) for (const s of subtypes(c)) if (s in tribos) tags.get(c.name).add('tribo:' + s);

  // arquétipos por par de cores
  const share = (ids, t) => ids.reduce((a, i) => a + (tags.get(i).has(t) ? 1 : 0), 0) / Math.max(1, ids.length);
  const all = new Set(); tags.forEach(s => s.forEach(t => all.add(t)));
  const gen = Object.fromEntries([...all].map(t => [t, share(nonland, t)]));
  const ci = c => new Set(c.ci || []);
  const arquetipos = [];
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) {
    const a = COLORS[i], b = COLORS[j];
    const gold = cards.filter(c => role(c) !== 'terreno' && ci(c).size === 2 && ci(c).has(a) && ci(c).has(b));
    const base = cards.filter(c => role(c) !== 'terreno' && [...ci(c)].every(x => x === a || x === b));
    const gids = gold.map(c => c.name), bids = base.map(c => c.name);
    const cnt = new Map();
    for (const n of gids) for (const t of tags.get(n)) cnt.set(t, (cnt.get(t) || 0) + 1);
    let sig = [...cnt].filter(([t, v]) => v >= 2 && t !== 'etb' && t !== 'pump').sort((x, y) => y[1] - x[1]).slice(0, 4).map(x => x[0]);
    const fraca = gold.length < R.th.assinatura_min_multicoloridas;
    const lift = [...all].map(t => [share(bids, t) / Math.max(.02, gen[t]), bids.filter(n => tags.get(n).has(t)).length, t])
      .filter(x => x[1] >= 5).sort((x, y) => y[0] - x[0]);
    if (fraca || !sig.length) sig = lift.slice(0, 3).map(x => x[2]);
    const ex = gold.slice().sort((x, y) => (rarOrder[x.rar] ?? 9) - (rarOrder[y.rar] ?? 9) || y.cmc - x.cmc).slice(0, 6).map(c => c.name);
    arquetipos.push({ cores: a + b, multicoloridas: gold.length, jogaveis_no_par: base.length, assinatura_fraca: fraca, assinatura: sig, destaque_por_lift: lift.slice(0, 4).map(x => x[2]), exemplos: ex, nomes_base: bids });
  }

  // cartas parecidas (Jaccard nas etiquetas, 2+ em comum)
  const ids = nonland.filter(n => tags.get(n).size);
  const parecidas = {};
  for (const x of ids) {
    const A = tags.get(x), out = [];
    for (const y of ids) {
      if (y === x) continue;
      const B = tags.get(y); let inter = 0; for (const t of A) if (B.has(t)) inter++;
      if (inter >= 2) out.push([inter / (A.size + B.size - inter), y, [...A].filter(t => B.has(t))]);
    }
    parecidas[x] = out.sort((p, q) => q[0] - p[0]).slice(0, 3).map(([s, n, comuns]) => ({ nome: n, sim: Math.round(s * 100) / 100, comuns }));
  }
  const cobertura = nonland.filter(n => tags.get(n).size).length / Math.max(1, nonland.length);
  return { impressoes: prints.length, cartas: cards.length, nao_terrenos: nonland.length, cobertura: Math.round(cobertura * 1000) / 1000,
    mecanicas, tribos, arquetipos, etiquetas: Object.fromEntries([...tags].map(([n, s]) => [n, [...s].sort()])), parecidas };
}

// Pontuação de um arquétipo pelos votos: soma dos pesos das cartas do par que têm uma etiqueta de assinatura.
export const PESO = { s: 3, y: 2, m: 1, n: 0, '-': 1 };
export function pontuar(arq, etiquetas, voteOfName) {
  let pts = 0, semVoto = 0, n = 0;
  for (const nome of arq.nomes_base) {
    if (!(etiquetas[nome] || []).some(t => arq.assinatura.includes(t))) continue;
    const v = voteOfName(nome) || '-'; if (v === 'x') continue;
    pts += PESO[v]; n++; if (v === '-') semVoto++;
  }
  return { pts, cartas: n, semVoto };
}
