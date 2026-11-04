// HTML da tela Arquétipos. Chips com data-tag filtram a Grade; nada aqui toca o armazenamento.
import { label } from './archetypes.js';
import { COL } from './lands.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const chip = (R, t, n) => `<button class="chip-tag" data-tag="${esc(t)}">${esc(label(R, t))}${n != null ? ` <span>${n}</span>` : ''}</button>`;
const dots = cores => [...cores].map(c => `<span class="dot" style="background:${COL[c][1]}" title="${COL[c][0]}"></span>`).join('');

export function renderArq(a, R, scores, setName, anyVote) {
  const mec = Object.entries(a.mecanicas).sort((x, y) => y[1] - x[1]).map(([k, v]) => chip(R, 'mec:' + k, v)).join('') || '<span class="vm-info">Nenhuma.</span>';
  const tri = Object.entries(a.tribos).sort((x, y) => y[1].criaturas - x[1].criaturas).map(([k, v]) => chip(R, 'tribo:' + k, v.criaturas)).join('') || '<span class="vm-info">Nenhuma.</span>';
  const ranked = scores ? a.arquetipos.map(x => ({ x, s: scores[x.cores] })).filter(o => o.s && o.s.cartas).sort((p, q) => q.s.pts - p.s.pts).slice(0, 4) : [];
  const best = anyVote && ranked.length
    ? `<div class="vm-box"><h3>Seus melhores arquétipos</h3><div class="vm-info">Soma dos votos (Bomba 3, Sim 2, Meh 1, Não 0, sem voto 1) das cartas do par com uma etiqueta da assinatura. A nota é <b>sua</b>, não um ranking externo.</div>
       ${ranked.map(({ x, s }, i) => `<div class="arq-row">${i + 1}. ${dots(x.cores)} <b>${s.pts} pts</b> <span class="vm-info">${s.cartas} cartas${s.semVoto ? `, ${s.semVoto} sem voto` : ''}</span></div>`).join('')}</div>`
    : `<div class="vm-box"><h3>Seus melhores arquétipos</h3><div class="vm-info">Vote algumas cartas na Triagem para ver a pontuação por par de cores.</div></div>`;
  const cards = a.arquetipos.map(x => {
    const sc = scores && scores[x.cores];
    return `<div class="vm-box"><h3>${dots(x.cores)} ${x.cores}</h3>
      <div class="vm-info">${x.multicoloridas} multicolorida${x.multicoloridas === 1 ? '' : 's'} · ${x.jogaveis_no_par} jogáveis no par${sc && sc.cartas ? ` · <b>${sc.pts} pts</b> pelos seus votos` : ''}</div>
      ${x.assinatura_fraca ? '<div class="vm-info warn">Poucas multicoloridas: leitura menos segura (assinatura pelas etiquetas mais frequentes no par).</div>' : ''}
      <div class="chips-tag">${x.assinatura.map(t => chip(R, t)).join('') || '<span class="vm-info">Sem assinatura clara.</span>'}</div>
      <div class="vm-info">Exemplos: ${x.exemplos.map(esc).join('; ') || '—'}</div></div>`;
  }).join('');
  return `<div class="vm-box"><h3>${esc(setName)}</h3>
      <div class="vm-info">${a.cartas} cartas (${a.impressoes} impressões), ${a.nao_terrenos} não-terrenos, ${Math.round(a.cobertura * 100)}% com alguma etiqueta. As etiquetas vêm do texto das cartas por regras editáveis (<b>data/rules.json</b>) e podem errar. Toque em qualquer etiqueta para filtrar a Grade.</div></div>
    ${best}
    <div class="vm-box"><h3>Mecânicas da edição</h3><div class="chips-tag">${mec}</div></div>
    <div class="vm-box"><h3>Tribos</h3><div class="chips-tag">${tri}</div></div>
    ${cards}`;
}
