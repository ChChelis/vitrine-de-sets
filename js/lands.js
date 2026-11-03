// Lands por cor: regra de três sobre os pips de cada cor, com sobras pelo maior resto.
export const COL = { W: ['Branco', '#FAC775'], U: ['Azul', '#378ADD'], B: ['Preto', '#5F5E5A'], R: ['Vermelho', '#E24B4A'], G: ['Verde', '#639922'], C: ['Incolor', '#B4B2A9'] };

export function split(total, rows) {
  const m = {};
  rows.forEach(r => { const p = +r.p; if (p > 0) m[r.c] = (m[r.c] || 0) + p; });
  const ks = Object.keys(m);
  if (!ks.length) return null;
  const sum = ks.reduce((a, k) => a + m[k], 0);
  const res = ks.map(k => { const x = total * m[k] / sum; return { c: k, p: m[k], x, n: Math.floor(x) }; });
  const left = total - res.reduce((a, r) => a + r.n, 0);
  res.slice().sort((a, b) => (b.x - b.n) - (a.x - a.n)).slice(0, left).forEach(r => r.n++);
  return { res, sum, dup: rows.filter(r => +r.p > 0).length > ks.length };
}

// Conta pips de custos de mana como "{1}{W}{W/U}{G/P}". Híbrido conta uma vez em cada cor.
export function pips(costs) {
  const out = {};
  for (const cost of [].concat(costs)) for (const [, s] of String(cost || '').matchAll(/\{([^}]+)\}/g))
    for (const c of new Set(s.split('/').filter(x => 'WUBRGC'.includes(x) && x.length === 1))) out[c] = (out[c] || 0) + 1;
  return out;
}

const fmt = x => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function mountLands(root) {
  root.innerHTML = `<label class="ln-total">Lands no deck<input id="lt" type="number" min="1" max="60" step="1" value="17" inputmode="numeric"></label>
    <div class="ln-head"><span>Cor</span><span>Pips contados</span></div>
    <div id="lr" class="ln-rows"></div>
    <div><button type="button" class="btn" id="la">Adicionar cor</button></div>
    <div id="le" class="vm-info warn"></div><div id="lo" class="ln-out"></div>`;
  const $ = s => root.querySelector(s);
  let rows = [{ c: 'W', p: '' }, { c: 'U', p: '' }];
  const calc = () => {
    const T = parseInt($('#lt').value, 10); $('#le').textContent = '';
    if (!(T >= 1 && T <= 60)) { $('#le').textContent = 'Informe o total de lands, de 1 a 60'; $('#lo').innerHTML = ''; return; }
    const r = split(T, rows);
    if (!r) { $('#lo').innerHTML = '<div class="vm-info">Preencha os pips de pelo menos uma cor.</div>'; return; }
    $('#lo').innerHTML = r.res.map(x => `<div class="ln-res"><span class="dot" style="background:${COL[x.c][1]}"></span><span class="ln-lbl">${COL[x.c][0]}<br><span class="vm-info">${x.p} pip${x.p > 1 ? 's' : ''} · ${fmt(100 * x.p / r.sum)}% · exato ${fmt(x.x)}</span></span><b class="ln-n">${x.n}</b></div>`).join('')
      + `<div class="vm-info">Total: ${T} lands${r.dup ? ' · cores repetidas foram somadas' : ''}</div>`;
  };
  const draw = () => {
    $('#lr').innerHTML = '';
    rows.forEach((r, i) => {
      const d = document.createElement('div'); d.className = 'ln-row';
      d.innerHTML = `<span class="dot" style="background:${COL[r.c][1]}"></span><select aria-label="Cor">${Object.keys(COL).map(k => `<option value="${k}" ${k === r.c ? 'selected' : ''}>${COL[k][0]}</option>`).join('')}</select><input type="number" min="0" step="1" inputmode="numeric" placeholder="0" aria-label="Pips contados" value="${esc(r.p)}"><button type="button" class="btn" aria-label="Remover cor">×</button>`;
      d.querySelector('select').onchange = e => { r.c = e.target.value; d.querySelector('.dot').style.background = COL[r.c][1]; calc(); };
      d.querySelector('input').oninput = e => { r.p = e.target.value; calc(); };
      d.querySelector('button').onclick = () => { if (rows.length > 1) { rows.splice(i, 1); draw(); calc(); } };
      $('#lr').appendChild(d);
    });
  };
  $('#la').onclick = () => { const used = rows.map(r => r.c); rows.push({ c: Object.keys(COL).find(k => !used.includes(k)) || 'C', p: '' }); draw(); calc(); };
  $('#lt').oninput = calc;
  draw(); calc();
  // usado pelo relatório: preenche pips e total
  return { fill(p, total) { rows = Object.keys(p).map(c => ({ c, p: String(p[c]) })); if (!rows.length) rows = [{ c: 'W', p: '' }]; if (total) $('#lt').value = total; draw(); calc(); } };
}
