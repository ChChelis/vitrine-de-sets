# Vitrine de Sets (PWA)

App estático, sem build: `index.html` + `js/` (módulos ES) + `sw.js`. Funciona offline depois da primeira carga.

- `js/store.js`: IndexedDB (edições, cartas, votos e lista, preferências).
- `js/scryfall.js`: cliente do Scryfall (100 ms entre chamadas, `Accept`, retry). Mesma lógica de variantes do `fetch_set.py` antigo.
- `js/catalog.js`: adicionar edição por sigla, atualizar (mescla, nunca remove) e arquivar.
- `js/backup.js`: exportar/importar JSON (votos, lista, preferências).
- `sw.js`: cache do app e das imagens; avisa quando há versão nova. No deploy, `BUILD` vira o hash do commit.

Rodar local: `python -m http.server 8080` e abrir http://localhost:8080 (service worker funciona em localhost).
Dados e imagens: Scryfall. Projeto não oficial.
