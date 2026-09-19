# BRIEF — CORSIA C · i filtri dei fornitori e i LOGHI veri

> FASE 4-bis, owner 19/09/2026: «**Ci devono essere tutti i filtri relativi: per Provider, per
> Impostato, per Non impostato, qualcosa di fatto bene**» e «**tutti i provider devono avere il logo
> reale del provider stesso** — segnalo e fallo dopo verifica screenshot». Metodo: quello delle
> Impostazioni. Modello: **Opus 5, high**.

## ⛔ COSA ESISTE GIÀ (misurato il 19/09/2026)

- ⛔ **Nel mockup i filtri NON ci sono**: il «Configurato⌄» che si vede è il **selettore di scenario
  della statusbar**, non un filtro di prodotto. ⇒ Questa è una richiesta **in più** dell'owner, non
  una parità: si progetta, non si copia.
- **I fornitori veri sono 28** e ognuno porta **uno stato della chiave**, misurato sul 4174:
  «**Chiave salvata**» (OpenRouter) · «**Chiave dall'ambiente**» (OpenAI, DeepSeek, Anthropic,
  Google Gemini) · «**Chiave mancante**» (Kimi, MiniMax, Qwen, Z.AI, Groq) · «**Chiave facoltativa**»
  (Ollama Local, LM Studio), più «Indirizzo predefinito» e «Mai provato».
  ⇒ «Impostato» / «Non impostato» **si legge da questi stati**, non da una lista inventata da te.
- **Loghi**: ⛔ **nel repo non esiste nessun asset di logo** (`src/assets/`: fonts, prism,
  shell-quote, talos, xterm — nient'altro). Il mockup usa glifi **per famiglia di modello**
  (`glyph-qwen`, `glyph-gemma`, `glyph-cloud`), non loghi di fornitore.
- La barra a faccette del laboratorio (`catalogo-faccette.js`) è la **forma** già approvata per un
  altro elenco: guardala prima di disegnarne una nuova — ma i filtri dei fornitori sono un'altra
  cosa (stati, non caratteristiche del catalogo).

## Il tuo compito

1. **Una riga di filtri sopra la lista dei fornitori**: almeno **per fornitore**, **Impostato** /
   **Non impostato** (e ciò che i dati veri sostengono: «facoltativa», «mai provato»), **coi
   conteggi veri**, che filtri DAVVERO la lista e si possa togliere.
2. **Il logo vero di ogni fornitore**, **bundled** (mai da CDN: local-first è la premessa del
   prodotto), con un **ripiego onesto** per il fornitore che non ha un logo.

## I tuoi file — e SOLO questi

- un nuovo `harness-ui/frontend/src/components/loghi-fornitori.js` (la mappa fornitore → logo e il
  disegno del glifo)
- gli **asset dei loghi** che aggiungi (una cartella nuova sotto `src/assets/`)
- `harness-ui/frontend/src/components/provider-card.js` — ⚠️ **SOLO le righe dei filtri e del
  glifo**: la **testata, i filetti, il piede e la modale sono della corsia B**, che lavora su questo
  stesso file **adesso**. Accordo già preso: lei prende quelli, tu questi. Se vi serve la stessa
  funzione, **la scrive una sola** e l'altra la usa.
- un nuovo `harness-ui/frontend/tests/browser/lab-provider-filtri.spec.mjs`

⛔ **NON toccare**: `src/legacy/app.js`, `index.template.html`, `lab-cornice-v3.js`, `catalogo-*.js`,
`download-coda.js`, `misura-memoria.js`, `src/styles/*` (la chiedi), `public/*`, gli altri spec.

## Ricerca — fatta (19/09/2026) e da completare sul passo dei loghi

- **Faccette e filtri**: il **conteggio per valore** è ciò che li rende intelligenti; **OR dentro una
  faccetta, AND fra faccette**; i valori a **zero si grigiano**; 5-8 filtri visibili al massimo;
  `aria-live` sui cambi di risultato. Fonti: <https://www.saasui.design/blog/saas-filtering-sorting-ux-patterns> ·
  <https://www.ideaplan.io/templates/faceted-search-template> ·
  <https://www.designsystems.one/design-systems/patterns/filters-and-refinement> (19/09/2026).
- **Loghi**: la sorgente va scelta **con la licenza in mano** — **Simple Icons** è **CC0-1.0**,
  ~3.400 icone, **monocromatiche** (un path + l'esadecimale del marchio), pacchetto npm
  **tree-shakeable**; **theSVG** è **MIT** con **varianti a colori** (color/mono/light/dark/wordmark).
  ⛔ Ogni icona porta i **suoi** metadati di licenza, e **nessuna libreria concede diritti di
  marchio**: va verificato **per marchio**, e ciò che non è verificabile **si elenca e non si usa**.
  Fonti: <https://dev.to/thegdsks/i-tested-every-open-source-brand-svg-library-so-you-dont-have-to-2026-edition-3jcc> ·
  <https://thesvg.org/blog/introducing-thesvg> · <https://sourceforge.net/projects/simple-icons.mirror/>
  (lette il 19/09/2026). ⛔ **Il pacchetto si installa e si bundla** — nessuna richiesta a un CDN,
  mai.
- **Per ogni passo non coperto**, cerca e **cita fonte + data nel commento**.

## Cosa dichiara finito il tuo lavoro

1. I filtri **funzionanti** (filtrano davvero, si tolgono, i conteggi seguono), visti sul **4174** nei
   due temi a 1024 e 1440, **foto tue a pagina intera e guardate**.
2. **Ogni fornitore col suo logo**, bundled, **con la licenza e la fonte dichiarate** accanto al
   file; il ripiego per chi non ce l'ha.
3. L'elenco dei fornitori **senza un logo verificabile** (nome + perché), che l'owner deve vedere.
4. Il tuo spec verde, la tabella delle differenze dal mockup, e per ogni difesa **il rosso provato**.
5. ⛔ E una riga di verifica che l'owner ha chiesto: **nessuna richiesta di rete** verso l'esterno
   per i loghi (misurata: le richieste non-GET/GET verso host esterni sono **zero**).

## Regole di casa

⛔ Niente `npm run build`/`public/`/commit · **4174 sola lettura** (non-GET fermate e contate) ·
**porta tua, 4217** · i selettori **dal sorgente** · ciò che non si collega **si elenca**.
⚠️ **Un'altra corsia scrive nello stesso file**: prima di ogni salvataggio, rileggi le righe che
stai per toccare — e non riformattare il file intero.
