// Pré-release vs votos: cruza o CSV do ManaBox com os votos e sugere decks. Funções puras (sem DOM) + render em HTML.
import { pips } from './lands.js';

export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(x => x !== '')) rows.push(row); row = []; }
    else cell += ch;
  }
  row.push(cell); if (row.some(x => x !== '')) rows.push(row);
  const head = (rows.shift() || []).map(h => h.trim());
  return rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] || ''])));
}

export const VOTE_ORDER = ['s', 'y', 'm', 'n', '-'];
export const VOTE_NAME = { s: 'Bomba', y: 'Sim', m: 'Meh', n: 'Não', '-': 'Sem voto' };
const WEIGHT = { s: 3, y: 2, m: 1, n: 0, '-': 1 };
const nz = n => String(n).replace(/^0+/, '');

// cardsBySet: {codigo: [cartas]}; votes: {"sigla|id": s|y|m|n}
export function analyze(csvRows, votes, cardsBySet) {
  const byId = new Map(), byNum = new Map(), byName = new Map(), nameVotes = new Map();
  const totals = {};
  for (const code in cardsBySet) {
    totals[code] = { s: 0, y: 0, m: 0, n: 0, '-': 0 };
    for (const c of cardsBySet[code]) {
      byId.set(c.id, c); byNum.set(code + '|' + nz(c.num), c);
      const nk = code + '|' + c.name.toLowerCase(); if (!byName.has(nk)) byName.set(nk, c);
      if (/Basic Land/.test(c.type)) continue;
      let v = votes[code + '|' + c.id]; if (v === 'x') continue;   // ignorada: fora da conta
      totals[code][v || '-']++;
      if (v) { const a = nameVotes.get(nk) || []; a.push(v); nameVotes.set(nk, a); }
    }
  }
  const g = (r, ...k) => { for (const x of k) if (r[x]) return r[x]; return ''; };
  const pulled = new Map(), fora = {}, naoMapeadas = [];
  for (const r of csvRows) {
    const sid = g(r, 'Scryfall ID', 'scryfall_id'), code = g(r, 'Set code', 'set_code').toLowerCase();
    const num = nz(g(r, 'Collector number', 'collector_number')), name = g(r, 'Name', 'name');
    const qty = Math.round(parseFloat(g(r, 'Quantity', 'quantity') || '1')) || 1;
    const c = byId.get(sid) || byNum.get(code + '|' + num) || byName.get(code + '|' + name.toLowerCase());
    if (!c) { fora[code || '?'] = (fora[code || '?'] || 0) + qty; naoMapeadas.push(name); continue; }
    const p = pulled.get(c.id) || { card: c, qty: 0, foil: 0 }; pulled.set(c.id, p);
    p.qty += qty;
    if (/^(foil|etched|true|1)$/i.test(g(r, 'Foil', 'foil'))) p.foil += qty;
  }
  const out = [];
  for (const p of pulled.values()) {
    const c = p.card, nk = c.set + '|' + c.name.toLowerCase();
    let v = votes[c.set + '|' + c.id], alt = false; if (v === 'x') v = undefined;
    if (!v) { const a = nameVotes.get(nk) || []; for (const x of 'symn') if (a.includes(x)) { v = x; alt = true; break; } }
    out.push({ ...p, voto: v || '-', alt });
  }
  return { totals, pulled: out, fora, naoMapeadas };
}

/* ---- relatório de pulls ---- */
export function pullReport(res, code, cards, votes) {
  const mine = res.pulled.filter(p => p.card.set === code);
  const rows = VOTE_ORDER.map(v => {
    const votadas = res.totals[code][v], ps = mine.filter(p => p.voto === v);
    // "únicas": cartas distintas tiradas; "% que saíram": das cartas com esse voto, quantas saíram em alguma cópia
    const exatas = ps.filter(p => !p.alt).length;
    return { v, votadas, copias: ps.reduce((a, p) => a + p.qty, 0), unicas: ps.length, pct: votadas ? Math.round(100 * exatas / votadas) : null };
  });
  const lst = v => mine.filter(p => p.voto === v).sort((a, b) => b.qty - a.qty || a.card.name.localeCompare(b.card.name));
  const nomesTirados = new Set(mine.map(p => p.card.name.toLowerCase()));
  return { rows, bombas: lst('s'), sims: lst('y'), nao: lst('n'), total: mine.reduce((a, p) => a + p.qty, 0),
    bombasFora: cards.filter(c => votes[code + '|' + c.id] === 's' && !nomesTirados.has(c.name.toLowerCase())) };
}

/* ---- overview de decks ---- */
const GENERIC = new Set(['etb', 'pump', 'removal', 'sweeper', 'evasion', 'draw', 'finisher', 'mana_creature']);
const COLORS = ['W', 'U', 'B', 'R', 'G'];
export const PAIRS = COLORS.flatMap((a, i) => COLORS.slice(i + 1).map(b => a + b));
const isLand = c => /\bLand\b/.test(c.type);
const REM = /destroy target|exile target|deals? \d+ damage to (?:any target|target|up to)|gets? [-−]\d+\/[-−]\d+|fights? |return target [^.]* to (?:its|their) owner's hand/i;
const EVA = /\b(flying|menace|trample|shadow|fear|intimidate|skulk)\b|can't be blocked/i;
const DRAW = /\bdraws? (?:a|an|two|three|\d+) cards?|\bscry \d|investigate|create a clue/i;

// ctx (opcional): { etiquetas: {nome: [tags]}, label: tag => rótulo }. Com ele, função das cartas e temas vêm das etiquetas.
export function deckOverview(res, code, topN = 3, ctx = null) {
  const mine = res.pulled.filter(p => p.card.set === code && !isLand(p.card));
  const fits = (c, pair) => !c.col || [...c.col].every(x => pair.includes(x));
  const decks = PAIRS.map(pair => {
    const pool = mine.filter(p => fits(p.card, pair) && WEIGHT[p.voto] > 0)
      .sort((a, b) => WEIGHT[b.voto] - WEIGHT[a.voto] || a.card.cmc - b.card.cmc);
    const copies = pool.reduce((a, p) => a + p.qty, 0);
    const score = pool.reduce((a, p) => a + WEIGHT[p.voto] * p.qty, 0);
    // 23 não-terrenos: melhores primeiro, respeitando as cópias
    const pick = []; let n = 0;
    for (const p of pool) { const k = Math.min(p.qty, 23 - n); if (k <= 0) break; pick.push({ ...p, use: k }); n += k; }
    const cur = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }; let cre = 0, rem = 0, eva = 0, drw = 0, nv = 0;
    const kw = {}, types = {}, ipsAll = {};
    for (const p of pick) {
      const c = p.card, k = p.use;
      cur[Math.min(5, Math.max(1, Math.ceil(c.cmc)))] += k;
      if (/Creature/.test(c.type)) { cre += k; if (!ctx) for (const t of (c.type.split('—')[1] || '').trim().split(/\s+/).filter(Boolean)) types[t] = (types[t] || 0) + k; }
      const tg = ctx && ctx.etiquetas[c.name];
      if (tg) {
        if (tg.includes('removal') || tg.includes('sweeper')) rem += k;
        if (tg.includes('evasion')) eva += k;
        if (tg.includes('draw') || tg.includes('selection')) drw += k;
        for (const t of tg) { if (t.startsWith('tribo:')) types[t.slice(6)] = (types[t.slice(6)] || 0) + k; else if (!GENERIC.has(t)) kw[ctx.label(t)] = (kw[ctx.label(t)] || 0) + k; }
      } else {
        const tx = c.oracle_text || '';
        if (REM.test(tx)) rem += k; if (EVA.test(tx) || (c.keywords || []).some(x => /flying|menace|trample/i.test(x))) eva += k; if (DRAW.test(tx)) drw += k;
        for (const x of c.keywords || []) kw[x] = (kw[x] || 0) + k;
      }
      if (p.voto === '-') nv += k;
      const pp = pips(c.mana_cost); for (const x in pp) ipsAll[x] = (ipsAll[x] || 0) + pp[x] * k;
    }
    const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} (${v})`);
    return { pair, score, copies, pick, n, faltam: Math.max(0, 23 - n),
      curve: { '1-2': cur[1] + cur[2], 3: cur[3], 4: cur[4], '5+': cur[5] }, criaturas: cre, magicas: n - cre,
      remocao: rem, evasao: eva, compra: drw, semVoto: nv, temas: top(kw), tipos: top(types), pips: ipsAll };
  });
  // por cor (jogáveis só da cor, sem pares)
  const mono = COLORS.map(c => ({ c, copies: mine.filter(p => p.card.col === c && WEIGHT[p.voto] > 0).reduce((a, p) => a + p.qty, 0) }));
  return { mono, ranking: decks.sort((a, b) => b.score - a.score).slice(0, topN), all: decks };
}

/* ---- HTML ---- */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nameList = (ps, flag) => ps.length ? '<ul class="rp-list">' + ps.map(p => `<li>${esc(p.card.name)} × ${p.qty}${p.alt ? ' <span class="warn">(voto de outra versão)</span>' : ''}</li>`).join('') + '</ul>' : '<div class="vm-info">Nenhuma.</div>';

export function renderPull(r, code) {
  const t = r.rows.map(x => `<tr><td>${VOTE_NAME[x.v]}</td><td>${x.votadas}</td><td>${x.copias}</td><td>${x.unicas}</td><td>${x.pct == null ? '—' : x.pct + '%'}</td></tr>`).join('');
  return `<div class="vm-box"><h3>Pulls por voto — ${esc(code.toUpperCase())} (${r.total} cartas tiradas)</h3>
    <table class="rp-t"><tr><th></th><th>Votadas</th><th>Tiradas</th><th>Únicas</th><th>% saíram</th></tr>${t}</table>
    <div class="vm-info">“Votadas” = cartas da edição com esse voto (sem voto = o resto). “% saíram” só conta a mesma versão votada.</div></div>
  <div class="vm-box"><h3>Bombas tiradas</h3>${nameList(r.bombas)}</div>
  <div class="vm-box"><h3>Sims tirados</h3>${nameList(r.sims)}</div>
  <div class="vm-box"><h3>Bombas que não saíram (alvo de troca)</h3>${r.bombasFora.length ? '<ul class="rp-list">' + r.bombasFora.map(c => `<li>${esc(c.name)} <span class="vm-info">#${esc(c.num)}</span></li>`).join('') + '</ul>' : '<div class="vm-info">Todas as bombas saíram.</div>'}</div>
  <div class="vm-box"><h3>“Não” que saíram</h3>${nameList(r.nao)}</div>`;
}

export function renderDecks(o, code) {
  const mono = o.mono.map(m => `${m.c}: ${m.copies}`).join(' · ');
  const decks = o.ranking.map((d, i) => `<div class="vm-box"><h3>${i + 1}. ${[...d.pair].join('/')} — ${d.score} pts</h3>
    <div class="vm-info">${d.copies} jogáveis (meta 22–24)${d.faltam ? ` · <span class="warn">faltam ${d.faltam} para 23</span>` : ''}${d.semVoto ? ` · ${d.semVoto} sem voto (peso 1)` : ''}</div>
    <table class="rp-t"><tr><th>Curva 1-2</th><th>3</th><th>4</th><th>5+</th><th>Criat.</th><th>Mág.</th></tr><tr><td>${d.curve['1-2']}</td><td>${d.curve[3]}</td><td>${d.curve[4]}</td><td>${d.curve['5+']}</td><td>${d.criaturas}</td><td>${d.magicas}</td></tr></table>
    <div class="vm-info">Remoção ${d.remocao} · evasão ${d.evasao} · compra/filtro ${d.compra}</div>
    <div class="vm-info">Temas: ${esc(d.temas.join(', ') || '—')} · Tribos/tipos: ${esc(d.tipos.join(', ') || '—')}</div>
    <details><summary>Lista dos ${d.n} não-terrenos</summary><ul class="rp-list">${d.pick.map(p => `<li>${p.use}× ${esc(p.card.name)} <span class="vm-info">${esc(p.card.mana_cost || '')} · ${VOTE_NAME[p.voto]}${p.alt ? '*' : ''}</span></li>`).join('')}</ul></details>
    <div class="vm-info">Pips: ${Object.entries(d.pips).map(([c, n]) => c + ' ' + n).join(' · ') || '—'}</div>
    <button class="btn" data-lands="${d.pair}">Calcular lands</button></div>`).join('');
  return `<div class="vm-box"><h3>Overview de decks — ${esc(code.toUpperCase())}</h3><div class="vm-info">Peso: Bomba 3, Sim 2, Meh 1, Não 0, sem voto 1. Jogáveis por cor (só mono): ${mono}. Incolores entram em qualquer deck; multicoloridas puxam o par. A qualidade é a <b>sua</b> nota (votos), não um ranking externo; remoção, evasão, compra e temas vêm das etiquetas do texto das cartas.</div></div>${decks || '<div class="vm-info">Sem cartas suficientes.</div>'}`;
}
