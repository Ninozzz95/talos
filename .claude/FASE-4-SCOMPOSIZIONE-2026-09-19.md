# FASE 4 — LE QUATTRO SCHEDE DEL LABORATORIO · scomposizione, 19/09/2026

> ⛔ **Questo documento è il cancello per aprire la fase.** La regola dell'owner (13/09): prima di
> aprire una fase si scrive la scomposizione — per ogni compito i **file** che tocca e **cosa lo
> dichiara finito** — e **le intersezioni di file devono essere VUOTE**. Se due compiti vogliono lo
> stesso file, o si fondono o uno aspetta.
>
> Owner 19/09/2026: «**via fase 4**». Modello ed effort: **Opus 5, high** (regola 16/09).

## Cosa sono le quattro schede, e cosa vuole il mockup

| scheda (id) | linguetta | nel mockup | nell'app oggi (misurato sul 4174) |
|---|---|---|---|
| `models` | **Hugging Face** | **PIENA**: ricerca + 9 ordinamenti + chip (Tutti/Locali 12/Cloud 3/Installati 2/Preferiti) + **4 faccette** + «Vedi altri» → 12 gruppi + «15 modelli» + «Viste salvate (0)»/«Salva vista»; 15 righe `1122×96` in 2 gruppi (SUL DISPOSITIVO 12 / VIA PROVIDER 3) | lista di repository HF reale (riquadri-bottone) + la barra dell'app (ricerca, autore, filtri, ordina). ⛔ **la barra a faccette NON è nella pagina** |
| `providers` | Provider | 2 card `551×332` + «Configura»/«Verifica accesso» + l'avviso «Qui non inserire chiavi reali.» | **28 fornitori**, 6908 caratteri, «Configura» apre le modali vere |
| `downloads` | Download | ⛔ **VUOTA**: 1 stato vuoto `1122×330` «Nessun download in coda.» + «Esplora il catalogo» | 3 contatori e **nessuna riga** (coda vuota) |
| `system` | Sistema | 2 card: «Memoria di esempio» (badge *Fixture*) + «Runtime locale» (*Pronto · demo*) | RAM/disco/runtime/motore grafico **veri** (Vulkan · AMD RX 9070 XT) + la Panoramica dentro |

⛔ **Solo `appearance` e `models` sono PIENE nel mockup** (le altre 7 voci sono `disabled`): per
`providers`, `downloads` e `system` **non c'è un disegno da copiare** — si porta lo **stile** del
mockup sul **contenuto vero** («il corrispondente reale così com'è ma applicando solo lo stile»,
owner 18/09). Per `models` invece il disegno **c'è**, ed è quello che va integrato.

## Le quattro corsie — proprietà dei file, intersezioni VUOTE

| # | corsia | file suoi (proprietà esclusiva) | cosa la dichiara finita |
|---|---|---|---|
| **1** | **Hugging Face + la barra a faccette** | `components/catalogo-faccette.js` · `components/catalogo-modelli.js` · `domain/catalog-engine.ts` · `tests/browser/lab-faccette.spec.mjs` | **`lab-faccette` 7/7 verdi** (oggi 7 `timedOut`) + «Model Lab filters» di `baseline-shell` verde + la barra **vista sul 4174** con le sue faccette e i conteggi |
| **2** | **Provider** | `components/provider-card.js` · `tests/browser/velo-fornitori.spec.mjs` · uno spec nuovo per le card | le 28 card nello stile del mockup (`551×332`, badge, «Configura»), le modali **vere** ancora raggiungibili, e la prova del difetto dichiarato **D9** (doppia testata) risolta o smentita |
| **3** | **Download** | `components/download-coda.js` · `components/modelli-installati.js` · uno spec nuovo | lo **stato vuoto** del mockup quando la coda è vuota, la coda **vera** quando c'è, e i 3 contatori coerenti con le righe |
| **4** | **Sistema** | `components/misura-memoria.js` · uno spec nuovo | le due card del mockup sul contenuto vero, e la **Panoramica dentro** senza perdere un id |

### I file MIEI, che nessuna corsia tocca

`src/legacy/app.js` · `src/legacy/frammenti.html` · `src/components/lab-cornice-v3.js` ·
`src/components/cornice-model-lab.js` · `src/styles/main.css` e i fogli nuovi · `index.template.html` ·
`harness-ui/public/*` (il bundle lo costruisce e lo consegna **l'orchestratore**, mai una corsia) ·
tutti gli spec già verdi.

⛔ **Perché questi sono miei**: sono i punti dove le quattro corsie si toccherebbero. `app.js` è
1,3 MB e ogni corsia ci vuole mettere mano (le chiamate di montaggio); `frammenti.html` contiene i
**sei pannelli legacy** che le quattro schede raggruppano. Se ognuna li toccasse, l'ultima che salva
vincerebbe in silenzio (lezione D3).

## ⛔ Le trappole misurate — vanno nel brief, non nella memoria di chi lavora

1. **La linguetta si chiama «Hugging Face»**, non «Modelli» (decisione dell'owner). Gli spec che la
   cercano per nome scadono in **timeout**: è la causa dei 7 `lab-faccette` rossi, **misurata** il
   19/09 (`lab-faccette.spec.mjs:195`). ⇒ Chi tocca quella prova **rilegge le sue asserzioni** invece
   di adattarle a occhio (lezione del 13/09 sul test adattato).
2. **Sei pannelli legacy** (`overview`, `providers`, `catalog`, `installed`, `huggingface`,
   `downloads`) vivono ancora nel DOM, raggruppati dal guscio nelle quattro schede. Le **6
   sotto-linguette** sono nascoste in `[data-lab-comandi]`. Non si rimuovono senza una misura.
3. ⛔ **Ci sono DUPLICATI legacy nascosti** nel DOM: i selettori devono ancorarsi al pannello giusto
   (`#modelLabCard` + `[data-model-lab-panel="…"]`), mai al documento intero.
4. **Due cancelli già verdi non si rompono**: `_fase3-banda.spec.mjs` (10) e `lab-guscio.spec.mjs`
   (9), più `_fase2-niente-perso.spec.mjs` (l'identità delle Impostazioni). Chi tocca il laboratorio
   li rilancia **prima** di consegnare.
5. **Il montaggio è protetto dal doppio** (`if (card.dataset.labGuscio === 'v3') return true;`) e la
   carta **rifiuta di montare** se una sezione resterebbe orfana (`data-lab-guscio-negato`).
6. ⛔ **La barra a faccette esiste, è importata, è chiamata e NON è nella pagina**: `catalogo-modelli.js:130`
   chiama `creaBarraFaccette`, ma `aggiornaCatalogoModelli` la costruisce solo `dati ? … : null` e la
   appende dentro `#modelLabCatalogPanel`. Misurato sul 4174 il 19/09: `#modelLabFacets` **0 copie**,
   `[data-catalog-facets]` **0**, caselle **0**, mentre il pannello HF è visibile e alto 1858 px.
   ⇒ **Il compito della corsia 1 è collegarla, non riscriverla**: il difetto è nella catena, non nel
   componente.
7. **La ricerca web è obbligatoria a ogni passo** (owner 18/09) e va citata con fonte e data nel
   commit. Fatte il 19/09, a disposizione delle corsie:
   - **facette/filtri**: il conteggio per valore è ciò che distingue una faccetta da un muro di
     caselle; OR dentro una faccetta, AND fra faccette; i valori a **zero si grigiano** (non si
     nascondono, salvo 50+ valori); «Vedi altri» oltre 5-10 valori; `aria-live` sui cambi di
     risultato; 5-8 faccette visibili al massimo. Fonti:
     <https://www.saasui.design/blog/saas-filtering-sorting-ux-patterns> ·
     <https://www.ideaplan.io/templates/faceted-search-template> ·
     <https://www.designsystems.one/design-systems/patterns/filters-and-refinement> ·
     <https://www.uixhero.com/resources/ui-components/filter> (lette 19/09/2026).

## Cosa NON è di questa fase

La **pagina del modello** (FASE 5: i tre lati, più il difetto `[object Object]` di
`scheda-modello.js:994` già localizzato col suo `file:riga`) · il **confronto finale** (FASE 6) ·
le **due sidebar** (PARTE B: prima si chiudono TUTTE le fasi delle impostazioni — ordine dell'owner).

## La review di ogni corsia — decisa PRIMA, non improvvisata alla consegna

⛔ Le tre condizioni di sempre ([[ogni-corsia-ha-il-suo-controllore]]): il revisore **cerca il
difetto**, **prova a romperlo** mostrando che la prova diventa rossa, e **dichiara** se ha verificato
davvero. E una quarta, imparata il 19/09 sulla mutazione: **baseline verde prima**, si rompe **una
cosa sola**, e il ripristino si verifica **al byte** (`git diff --numstat` di nuovo uguale, bundle
ricostruito `cmp`-identico al blindato). Se la prova resta verde togliendo la difesa che nomina,
**quel pezzo non è provato** — e va scritto, non aggiustato.

| corsia | la pretesa che provo a falsificare | la mutazione |
|---|---|---|
| **1 · faccette** | «la barra è collegata al catalogo vero e i conteggi seguono i filtri» | tolgo il montaggio della barra dal percorso vivo → il suo spec deve diventare **rosso**; e tolgo il ricalcolo del conteggio → il caso che lo misura deve diventare rosso |
| **2 · provider** | «le 28 card nel vestito del mockup e le modali vere ancora raggiungibili» | stacco il legame che apre la modale di configurazione → la prova deve diventare **rossa**; e cerco D9 con la misura, non a occhio |
| **3 · download** | «lo stato vuoto è quello del mockup e i contatori dicono il vero» | riempio/svuoto la coda → i contatori e le righe devono seguire; stacco la condizione dello stato vuoto → rosso |
| **4 · sistema** | «i fatti veri, senza zeri inventati, e la banda della FASE 3 intatta» | rinomino/rimuovo `#machineMemoryMetric` → `_fase3-banda` **deve** diventare rossa (prova che la dipendenza è reale e sorvegliata); e rimetto uno `0` al posto di un dato mancante → la prova della corsia deve morderlo |

⛔ **E la regola che vale per tutte**: la consegna arriva **non deployabile**; solo la review la rende
usabile, e una consegna bocciata si **ritira o si cura** — non si aggiusta in silenzio.

## Come si chiude (non è un'opinione)

`npm run build` + consegna sul 4174 dall'orchestratore · `npm run test:unit` (base **1420**) · gli
spec della corsia · **la cartella intera** `tests/browser` confrontando gli **insiemi** · il cancello
`_fase2-niente-perso` · **foto nei due temi a 1024 e 1440, guardate** · **review avversaria mia** su
ogni consegna, con la **mutazione** che fa diventare rossa la prova · niente è «usabile» finché la
review non passa (owner 18/09).
