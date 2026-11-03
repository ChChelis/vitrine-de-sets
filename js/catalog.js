// Edições no aparelho: adicionar por sigla, atualizar (cartas novas) e arquivar. Nada é apagado.
import * as db from './store.js';
import { fetchSet } from './scryfall.js';

export const DEFAULT_SETS = ['fra', 'trk'];

export const listSets = () => db.sets.all().then(a => a.sort((x, y) => (x.order ?? 0) - (y.order ?? 0)));
export const loadCards = code => db.cards.bySet(code);

// Baixa a edição e mescla: cartas já salvas são atualizadas, novas entram, nenhuma sai.
export async function syncSet(code, onProgress) {
  code = code.trim().toLowerCase();
  const [fresh, have, rows] = await Promise.all([fetchSet(code, onProgress), db.cards.bySet(code), listSets()]);
  const old = new Map(have.map(c => [c.id, c]));
  let added = 0, changed = 0;
  for (const c of fresh.cards) {
    const o = old.get(c.id);
    if (!o) added++; else if (JSON.stringify({ ...o, hc: 0 }) !== JSON.stringify({ ...c, hc: 0 })) changed++;
  }
  await db.cards.putMany(fresh.cards);
  const prev = rows.find(r => r.code === code);
  const total = old.size + added;
  const row = {
    ...prev, ...fresh.meta, icon: fresh.meta.icon || (prev && prev.icon) || null,
    archived: prev ? !!prev.archived : false, order: prev ? prev.order : rows.length,
    updated: new Date().toISOString(), have: total,
  };
  await db.sets.put(row);
  return { added, changed, total, row, isNew: !prev };
}

export async function setArchived(code, archived) {
  const r = (await listSets()).find(x => x.code === code);
  if (r) await db.sets.put({ ...r, archived });
}
