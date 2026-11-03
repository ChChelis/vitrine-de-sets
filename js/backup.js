// Exportar/importar votos, lista e preferências em um arquivo JSON (uma cópia por aparelho, sem sincronização).
export const FORMAT = 'vitrine-sets-backup';

export function build(user, prefs, setRows) {
  return {
    format: FORMAT, version: 1, exported: new Date().toISOString(),
    user: { list: user.list, votes: user.votes, qual: user.qual, lang: user.lang },
    prefs,
    sets: setRows.map(s => ({ code: s.code, archived: !!s.archived })),
  };
}

// Valida e devolve o conteúdo; lança Error com mensagem em português se não for um backup nosso.
export function parse(text) {
  let d;
  try { d = JSON.parse(text); } catch { throw new Error('O arquivo não é um JSON válido'); }
  if (!d || d.format !== FORMAT || !d.user) throw new Error('Este arquivo não é um backup da Vitrine de Sets');
  if (d.version > 1) throw new Error('Backup de uma versão mais nova do app');
  return d;
}

// Mescla sem perder nada do aparelho: o que vem do arquivo vence só nas mesmas chaves.
export function merge(user, d) {
  const out = { ...user, list: { ...user.list }, votes: { ...user.votes } };
  let nv = 0, nl = 0;
  for (const k in d.user.votes || {}) { if (out.votes[k] !== d.user.votes[k]) nv++; out.votes[k] = d.user.votes[k]; }
  for (const k in d.user.list || {}) { const a = out.list[k], b = d.user.list[k]; if (!a || a.q !== b.q) nl++; out.list[k] = { ...b }; }
  if (d.user.qual) out.qual = d.user.qual;
  if (d.user.lang) out.lang = d.user.lang;
  return { user: out, votes: nv, list: nl };
}

export function download(name, data, type) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
