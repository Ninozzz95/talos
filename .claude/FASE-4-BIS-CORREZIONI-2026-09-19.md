# FASE 4-bis — LE CORREZIONI DELL'OWNER sul laboratorio · scomposizione, 19/09/2026

> ⛔ Owner, 19/09/2026, guardando il suo schermo: **cinque difetti** e due istruzioni, più il metodo:
> «**DEVI FARE ESATTAMENTE LO STESSO MODUS OPERANDI CHE HAI FATTO PER LE IMPOSTAZIONI, ASPETTO,
> NIENTE DI MENO. SEGNALO E RICORDATELO E CONTINUA**».
> ⇒ Il metodo è in memoria (`metodo-refactor-sempre-lo-stesso-delle-impostazioni`): ricognizione
> misurata del mockup dal DOM vivo (**comprese le modali e cosa fa il clic su una riga**), ricerca
> per ogni passo, collegamento filo per filo coi `file:riga`, ciò che non si collega **elencato**,
> ogni difesa **rotta per provarla**, foto del 4174 nei due temi **a pagina intera**, review mia.

## I cinque difetti, come li ha visti lui, e lo stato MISURATO di ognuno (19/09/2026)

| # | quello che ha detto | cosa dicono le misure |
|---|---|---|
| **1** | «La lista Hugging Face non è quella del mock-up… molto migliore. **Quando clicchi sulla riga si apre la sidebar piccola e troppo stretta per ospitare la scheda del modello formattata in HTML: bisogna fare COME IL MOCKUP**» | Il mockup ha **ricerca + ordina + chip coi conteggi** (*Tutti · Locali 12 · Cloud 3 · Installati 2 · Preferiti*) + **4 select di faccetta** (*Grandezza · Contesto minimo · Formato · Compatibilità RAM*) + «15 modelli su 15» + «Viste salvate (0)» + **gruppi** («SUL DISPOSITIVO 12») + righe **1122×96** (glyph, badge *Predefinito*, meta, capacità, chevron, stella, casella). ⛔ **E il clic**: misurato sul 4174 il 19/09/2026 **con un confronto prima/dopo** (mai un selettore indovinato), nascendo **`ASIDE#modelLabHfDetail.talos-card`, `320×816`**, con dentro `#hfFileChoices`, `#hfStima` e `#hfScarica`. Nel mockup la riga porta invece alla **PAGINA DEL MODELLO a schermo pieno** — rotta che il prodotto **ha già** (`app.js:4134-4192`, `#/impostazioni/modelli/scheda/<id>/<card\|files\|compatibility>`, l'hero, la striscia a quattro blocchi, i tre lati). ⇒ **Il clic si riaggancia alla pagina**, e le funzioni del pannello stretto **non si perdono**: appartengono al lato «File del modello». |
| ⛔ | **ERRORE MIO, da non ripetere**: la prima sonda del clic premeva il **campo di ricerca** (il primo `<button>` del pannello) e non vedeva nulla; e avevo scritto nel brief della corsia A che «la sidebar è dell'orchestratore», su una premessa sbagliata. Corretto il brief con un messaggio alla corsia e corretto qui. |
| **2** | «Quando faccio "Configura" mi apre una modale del mock-up. Su 4174 c'è un **collapse bruttissimo**» | Il mockup apre un **`<dialog>` nativo, 600×514**, titolo «**Configura OpenRouter**», corpo che spiega («*Il flusso distingue configurazione e verifica*»), due campi **non modificabili** (endpoint e credenziale dimostrativi) e in fondo «**Annulla**» + «**Salva configurazione demo**». Da noi: nessuna modale, un collapse. |
| **3** | «Ci devono essere tutti i filtri relativi: per **Provider**, per **Impostato**, per **Non impostato**, qualcosa di fatto bene» | ⛔ **Nel mockup non ci sono**: il «Configurato⌄» che avevo misurato è il **selettore di scenario della statusbar**, non un filtro di prodotto. È una richiesta **in più** dell'owner. |
| **4** | «Lo stile delle carte dei Provider non è quello del mock-up» | Il mockup: card **551×332** con **riquadro del glifo**, nome + sottotitolo, badge («Verificato · demo»), **tre filetti** chiave/valore, e in fondo **pulsanti a pillola** («Configura» · «Verifica accesso»). Le nostre hanno una forma diversa. |
| **5** | «Download non ha tutte le opzioni: non posso **eliminare** i modelli installati, non posso **rinominarli**. È tutto previsto dal backend» | ⛔ **Vero**: `http-app.mjs:1251` espone **`POST /api/v1/local-models/<id>/{rename,copy-path,delete}`**. L'interfaccia non le mostra. |
| **6** | «Sistema può andare bene, **ma verifica ugualmente**» | Da riverificare con foto nei due temi (le mie foto a pagina intera sono in `%TEMP%/fase4-ispezione`). |
| **7** | «**Tutti i provider devono avere il logo reale** del provider stesso — segnalo e fallo dopo verifica screenshot» | Nel repo **non esiste nessun asset di logo** (`src/assets/` ha fonts, prism, shell-quote, talos, xterm); il mockup usa glifi **per famiglia di modello** (`glyph-qwen`, `glyph-gemma`, `glyph-cloud`), non loghi di fornitore. ⇒ Serve una **sorgente di loghi** (licenza compatibile, **bundled**: niente CDN, è la regola local-first del prodotto) e la mappa fornitore → logo. |

## Le quattro corsie (proprietà dei file, intersezioni VUOTE)

| # | corsia | file | cosa la dichiara finita |
|---|---|---|---|
| **A** | **La lista Hugging Face** (punto 1) | `components/hf-catalogo.js` · `components/catalogo-modelli.js` · `tests/browser/lab-hf-lista.spec.mjs` | ricerca + ordina + chip coi conteggi + le 4 faccette + i gruppi + le righe del mockup, **coi dati veri**; e la riga che apre **nella sidebar** |
| **B** | **Provider: modale + stile card** (punti 2, 4) | `components/provider-card.js` · `tests/browser/lab-provider.spec.mjs` | «Configura» apre una **`<dialog>`** col titolo del fornitore e i campi **veri** (endpoint, chiave), con Annulla/Salva; le card col vestito del mockup |
| **C** | **Provider: i filtri** (punto 3) + **i loghi** (punto 7) | `components/provider-card.js` (filtri) · un nuovo `components/loghi-fornitori.js` + gli asset | filtri per **fornitore**, **impostato**, **non impostato** (con i conteggi, OR dentro / AND fra); e il **logo vero** di ogni fornitore, **bundled** |
| **D** | **Download: elimina e rinomina** (punto 5) | `components/download-coda.js` · `components/modelli-installati.js` · `tests/browser/lab-download.spec.mjs` | le due azioni **collegate alle rotte vere** (`rename`, `delete`), con la conferma a due passi per l'eliminazione |

⛔ **La sidebar del punto 1 è MIA**: la destinazione della scheda del modello tocca `legacy/app.js` e
`index.template.html`, che nessuna corsia tocca. La corsia A prepara la lista e **mi passa il clic**;
io apro la scheda nella sidebar.

⛔ **E il punto 3 e il punto 7 hanno una corsia sola perché si toccano**: entrambi vestono la stessa
card del fornitore. Se il lavoro cresce, si separano con un file in più, non con due corsie sullo
stesso file.

## Ricerche già fatte per questa fase (fonte + data nel commento del codice)

- **Modali**: form breve ⇒ modale; `<dialog>` nativo + `showModal()` preferito; fuoco che entra e
  **torna al pulsante**; **ESC chiude sempre** (WCAG 2.1.2); su un form **non si chiude dal velo**;
  altezza ≤ 80-90vh con testata e piede fissi. Fonti: <https://vercel.com/geist/modal> ·
  <https://docs.cognite.com/aura-design-system/primitives/dialog> ·
  <https://dev.to/wdsega/component-deep-dive-47-modal-dialog-focus-trap-and-scroll-lock-are-non-negotiable-2ff3> ·
  <https://www.shaheermalik.com/blog/modal-design-best-practices> (19/09/2026).
- **Faccette e filtri** (per il punto 3): conteggio per valore, OR dentro / AND fra, zeri **grigiati**,
  «Vedi altri» oltre 5-10, `aria-live` sui risultati, 5-8 faccette visibili. Fonti:
  <https://www.saasui.design/blog/saas-filtering-sorting-ux-patterns> ·
  <https://www.ideaplan.io/templates/faceted-search-template> ·
  <https://www.designsystems.one/design-systems/patterns/filters-and-refinement> (19/09/2026).
- **Da fare per il punto 7**: la licenza e la forma dei loghi (Simple Icons e i marchi dei fornitori),
  con la regola local-first — **bundled, mai da CDN**.
- ⛔ **Da fare per il punto 1**: una ricerca sul **pannello di dettaglio laterale** (quando un elenco
  apre il dettaglio accanto invece che a schermo pieno) — è il passo che l'owner ha chiesto e non ha
  ancora la sua fonte.

## Cosa NON è di questa fase

La pagina del modello (FASE 5) e il confronto finale (FASE 6) restano dove sono; la **sidebar
sinistra** e il **grafo agenti** (PARTE B) vengono dopo, come da ordine dell'owner.
