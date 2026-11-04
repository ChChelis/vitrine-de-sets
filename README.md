# Vitrine de Sets (PWA)

App estático, sem build: `index.html` + `js/` (módulos ES) + `sw.js`. Funciona offline depois da primeira carga.

- `js/store.js`: IndexedDB (edições, cartas, votos e lista, preferências).
- `js/scryfall.js`: cliente do Scryfall (100 ms entre chamadas, `Accept`, retry). Mesma lógica de variantes do `fetch_set.py` antigo.
- `js/catalog.js`: adicionar edição por sigla, atualizar (mescla, nunca remove) e arquivar.
- `js/backup.js`: exportar/importar JSON (votos, lista, preferências).
- `sw.js`: cache do app e das imagens; avisa quando há versão nova. No deploy, `BUILD` vira o hash do commit.

Rodar local: `python -m http.server 8080` e abrir http://localhost:8080 (service worker funciona em localhost).
Dados e imagens: Scryfall. Projeto não oficial.

## Etiquetas e arquétipos

- `js/archetypes.js`: etiquetas por carta, mecânicas, tribos, arquétipos por par de cores e cartas parecidas. Tudo sobre o texto de regras do Scryfall, por **nome** de carta (várias artes contam uma vez).
- `data/rules.json`: as regras (regex, rótulos pt-BR, keywords, limiares). É dado editável: ajuste aqui, não no código.
- `js/arqview.js`: tela Arquétipos. Chips filtram a Grade; a Triagem mostra as etiquetas da carta; o carrossel mostra "Cartas parecidas".

### Teste das etiquetas

Rodar `python tools/devserver.py` e abrir `http://localhost:8080/tests/tagger.html` (conjunto de calibração, 40 cartas) ou `.../tagger.html?set=heldout` (22 cartas separadas). Os rótulos esperados (`tests/labeled.json`, `tests/heldout.json`) foram feitos lendo o texto de cada carta; **vale uma revisão sua**.

| conjunto | antes de ajustar as regras | depois |
|---|---|---|
| Calibração (40 cartas TRK/FRA) | 15/40 exatas (38%), precisão 86%, revocação 79% | 40/40 |
| Separado (22 cartas, rotuladas antes de ver o resultado) | 16/22 exatas (73%), precisão 86%, revocação 96% | 22/22 |

Os números "depois" estão **ajustados nos próprios exemplos**, então não provam acerto geral. A medida honesta é a coluna "antes" do conjunto separado: cerca de 73% das cartas saem com o conjunto de etiquetas exato, e a maior parte dos erros é uma etiqueta a mais ou a menos. Cobertura (não-terrenos com alguma etiqueta): TRK 97%, FRA 97%.
Para uma medida melhor, adicione mais cartas rotuladas em um terceiro arquivo e rode a página sem ajustar as regras antes.
