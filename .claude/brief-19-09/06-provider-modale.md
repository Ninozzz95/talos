# BRIEF — CORSIA B · la modale di «Configura» e il vestito delle card Provider

> FASE 4-bis, owner 19/09/2026: «**quando faccio "Configura" mi apre una modale del mock-up. Invece
> su 4174 c'è un collapse bruttissimo**» e «**lo stile delle carte dei Provider non è quello del
> mock-up**». Metodo: lo stesso delle Impostazioni. Modello: **Opus 5, high**.

## ⛔ COSA ESISTE GIÀ (misurato il 19/09/2026)

- **La modale del mockup**, misurata aprendola dal suo DOM vivo: è un **`<dialog>`**, **600×514**,
  centrata; titolo «**Configura OpenRouter**»; corpo: «Il flusso distingue configurazione e
  verifica. I campi qui sono esempi non modificabili: non inserire credenziali reali.» + due fatti
  (**Endpoint dimostrativo** `https://api.example.invalid/v1` · **Credenziale dimostrativa**
  «DEMO · nessun segreto presente»); in fondo **«Annulla»** e «**Salva configurazione demo**».
  Foto: `%TEMP%/mockup-tre-schede/provider-configura-modale.png`.
- **Le card del mockup**: `551×332` — riquadro del glyph, nome + sottotitolo, badge a destra
  («Verificato · demo» / «Locale · demo»), **tre filetti** chiave/valore (*Credenziale*,
  *Configurazione*, *Ultima prova*), e in fondo **due pulsanti a pillola** («Configura» ·
  «Verifica accesso»). Nella card locale: un paragrafo, due filetti, e «**Apri sistema**».
- **Da noi**: `components/provider-card.js` (284 righe, +292 toccate nella FASE 4) disegna le 28 card
  reali con i loro stati («Chiave salvata», «Chiave dall'ambiente», «Chiave mancante», «Chiave
  facoltativa»), «Aggiorna» e «Prova tutti». **«Configura» apre un collapse in place**, non una
  modale: è la cosa che l'owner ha bocciato.
- ⛔ **Il prodotto HA un gestore di modali**: il velo (`webview/…/manager.ts`, che rende **inerti i
  fratelli** del layer aperto, `manager.ts:53-67`) — non si inventa un secondo sistema.

## Il tuo compito

1. **«Configura» apre una `<dialog>`** col nome del fornitore (**«Configura <Fornitore>»**), i campi
   **veri** (endpoint, chiave), e in fondo **Annulla** + una primaria descrittiva («Salva
   configurazione»). Si usa il **gestore di modali del prodotto**, non un `role="dialog"` nuovo.
2. **Il vestito delle card** portato a quello del mockup (le misure sopra), **senza perdere** una
   funzione: gli stati delle chiavi, «Verifica accesso», «Prova tutti» restano vivi e raggiungibili.

## I tuoi file — e SOLO questi

- `harness-ui/frontend/src/components/provider-card.js`
- `harness-ui/frontend/tests/browser/lab-provider.spec.mjs` (le sue asserzioni si **rileggono** quando
  cambia la UI: si adatta il **bersaglio**, mai il significato)

⛔ **NON toccare**: `src/legacy/app.js`, `index.template.html`, `lab-cornice-v3.js`,
`cornice-model-lab.js`, `catalogo-*.js`, `download-coda.js`, `misura-memoria.js`, `src/styles/*`
(una regola che ti serve **la chiedi**), `public/*`, gli altri spec.
⚠️ **La corsia C lavora sullo STESSO file** per i filtri e i loghi: **accordo già preso** — tu prendi
la **testata, i filetti e il piede della card** e la modale; lei i **filtri sopra la lista** e il
**glifo**. Non toccate le stesse righe, e se vi serve la stessa funzione, **la scrive una sola**.

## Ricerca — fatta per questo passo (19/09/2026), e vale come metro

- Una modale si usa per un **form breve e focalizzato** (una chiave API lo è); i form lunghi
  preferiscono un pannello che lascia leggibile la pagina.
- **`<dialog>` nativo + `showModal()`** dà trappola del fuoco, ESC, `::backdrop` e blocco dello
  scorrimento senza codice.
- Il fuoco **entra nel primo controllo** e **torna al pulsante** che ha aperto; **ESC chiude sempre**
  (WCAG 2.1.2); su un form con dati **non si chiude dal velo** (si perde quello che si è scritto);
  altezza ≤ 80-90vh con testata e piede fissi e solo il corpo che scorre.
- La coppia distruttiva (cancellare una chiave) vuole **due passi** e il fuoco su «Annulla».
  Fonti: <https://vercel.com/geist/modal> · <https://docs.cognite.com/aura-design-system/primitives/dialog> ·
  <https://dev.to/wdsega/component-deep-dive-47-modal-dialog-focus-trap-and-scroll-lock-are-non-negotiable-2ff3> ·
  <https://www.shaheermalik.com/blog/modal-design-best-practices> (lette il 19/09/2026).
- **Per ogni passo non coperto**, cerca e **cita fonte + data nel commento**.

## Cosa dichiara finito il tuo lavoro

1. «Configura» apre la **modale** col nome del fornitore e i campi veri, **vista sul 4174** nei due
   temi a 1024 e 1440 (foto a pagina intera, guardate), con **ESC** e il ritorno del fuoco provati.
2. Le card col vestito del mockup, e «Verifica accesso»/«Prova tutti»/gli stati **ancora vivi**.
3. Le **foto affiancate** al mockup + la tabella delle differenze che restano.
4. Il tuo spec verde, `lab-provider` riletto, e i cancelli degli altri verdi.
5. Per ogni difesa, **il rosso provato** (baseline verde, una rottura sola, ripristino al byte).

## Regole di casa

⛔ Niente `npm run build`/`public/`/commit · **4174 sola lettura** (non-GET fermate e contate) ·
**porta tua, 4216** · i selettori **dal sorgente** · ciò che non si collega **si elenca**.
