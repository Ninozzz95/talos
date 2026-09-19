# BRIEF — CORSIA E · LA PAGINA DEL MODELLO COME IL MOCKUP (FASE 5)

> Owner 19/09/2026: «**vai, e la pagina del modello come il mockup**». Metodo: quello delle
> Impostazioni, niente di meno. Modello: **Opus 5, high**.

## ⛔ COSA ESISTE GIÀ — misurato il 19/09/2026, testa a testa

**IL MOCKUP** (`TALOS-Calm-Lab-04.html`, `#/impostazioni/modelli/scheda/local%3Aqwen8/card`,
foto `%TEMP%/pagina-modello/mockup-scheda-card.png`, misure dal DOM vivo):

- **toolbar** (`model-page-toolbar`, **1122×67**): «← Tutti i modelli» a sinistra | il nome + badge
  «Locale» | a destra **«Banco prova»** e **«Già predefinito»** (o **«Usa per le nuove chat»** → dialog
  «Una scelta esplicita.»);
- **hero**: glifo in un riquadro **72×72** arrotondato · eyebrow «NEL TUO LABORATORIO» · titolo
  «**Qwen3 8B**» **40px / 550 / ls −1,8px** · riga repository «⧉ Qwen/Qwen3-8B-GGUF» · a destra
  «**☆ Nei preferiti**» · sottotitolo «Conosci il modello. Scegli come usarlo.»;
- **striscia di contesto** (`model-context-strip`, **1122×75**): **quattro blocchi** separati da
  filetti — «DESTINAZIONE — Sul dispositivo» · «PROFILO DEMO — GGUF · Q4_K_M» · «STATO DEMO —
  ● Sul dispositivo» · «NUOVE CHAT — Modello predefinito»;
- **tre lati**: «Scheda Hugging Face» · «File del modello» · «Compatibilità», più a destra la nota
  «🛡 Nessun avvio automatico»;
- **il lato Scheda**: una carta con «**README.md** | Anteprima editoriale» + a destra «Stato demo
  [Disponibile ⌄]», una **sotto-nav** («IN QUESTA SCHEDA: Panoramica · Utilizzo · Contesto e limiti ·
  Fonte») e il **README reso** (titolo, descrizione, **chip dei tag**: Text generation · GGUF ·
  Apache-2.0 · Multilingue).

**DA NOI** (`components/scheda-modello.js`, 1158 righe; foto
`%TEMP%/pagina-modello/app-scheda-card.png`):

- la rotta **c'è e funziona** (`#/impostazioni/modelli/scheda/<id>/<card|files|compatibility>`,
  `app.js:4134-4192`) e la pagina è **a schermo pieno** con i **tre lati** ✓;
- ⛔ **ma è spoglia e sbagliata in testa**: il titolo è **l'id grezzo** («local:Qwen3-8B-GGUF-Qwen3-8B-Q4_0-gguf»)
  invece del nome umano; **manca la striscia a quattro blocchi** (c'è una riga di fatti con dei «—»);
  **mancano le azioni di destra**; il README è un **segnaposto**; e la pagina è per metà vuota.

## Il tuo compito

Portare la pagina del modello al disegno del mockup **sui dati veri**: toolbar con le due azioni a
destra, hero col glifo e il **nome umano**, **striscia a quattro blocchi**, e i tre lati col loro
contenuto vero (README reso, file, compatibilità). Ciò che il mockup mostra e i nostri dati non hanno
**si elenca, non si inventa**.

⛔ **E due difetti già localizzati da curare in questa fase** (dal piano, col `file:riga`):
1. `scheda-modello.js:994` — `[ispezione.backend, ispezione.build].filter(Boolean).join(' · ')`
   stampa **`[object Object] · [object Object]`**: i due campi sono **fatti tipizzati**
   (`local-runtime-probe.mjs:24-26`), e le righe sorelle (`:988-991`) li passano già a `rigaFatto`,
   che li sa leggere. La 994 li concatena a mano. **La cura è usare lo stesso trattamento.**
2. ⛔ **Le immagini di un README non fidato**: misurato e documentato — un `![alt](url)` **non
   incorpora niente**: emette un `<img src>` che il browser **va a prendere**, quindi un README di
   terzi può far «chiamare casa» al lettore, col referrer. Le cure che le fonti indicano: **lista di
   schemi e host ammessi**, **proxy lato server** (con protezione SSRF e URL firmati), **`img-src`
   nella CSP**, **Referrer-Policy deliberata**, mai identificatori negli URL delle immagini, e
   `data:`/`src=""` trattati con sospetto. Fonti:
   <https://dev.to/mdfold/markdown-images-are-network-requests-not-embedded-assets-5580> ·
   <https://github.com/npmx-dev/npmx.dev/pull/1143> ·
   <https://deepwiki.com/vercel/streamdown/3.10-security-and-sanitization> ·
   <https://tanstack.com/markdown/latest/docs/core-concepts/security> (lette il 19/09/2026).
   ⛔ **La decisione (bloccare le immagini remote, o passarle da un proxy) è dell'OWNER**: prepara le
   due strade con la misura, **non sceglierne una da solo**, e riporta quante immagini remote un
   README vero porta con sé (misurale su un repository reale del catalogo).

## I tuoi file — e SOLO questi

- `harness-ui/frontend/src/components/scheda-modello.js`
- un nuovo `harness-ui/frontend/tests/browser/lab-pagina-modello.spec.mjs`

⛔ **NON toccare**: `src/legacy/app.js` (la rotta e l'aggancio del clic sono **dell'orchestratore**),
`index.template.html`, `lab-cornice-v3.js`, `provider-card.js`, `hf-catalogo.js`, `catalogo-*.js`,
`download-coda.js`, `misura-memoria.js`, `src/styles/*` (una regola CSS che ti serve **la chiedi**,
motivata), `public/*`, gli altri spec.
⚠️ **Un'altra corsia sta lavorando sulla lista** (`hf-catalogo.js`): il clic sulla riga lo aggancio io.

## Ricerca — fatta (19/09/2026), e da completare per il tuo passo

- **Markdown non fidato**: si converte e si **sanifica con una lista di ammessi**; via script, gestori
  di eventi, stili, schemi pericolosi (`javascript:`, `vbscript:`, `file:`); i link esterni con
  `rel="noopener noreferrer"` (il nostro renderer lo fa già, misurato); il risultato è un
  **frammento**, non un documento. Fonti: <https://pkg.go.dev/github.com/ocidoc/ocidoc-render> ·
  <https://deepwiki.com/vercel/streamdown/3.10-security-and-sanitization> ·
  <https://tanstack.com/markdown/latest/docs/core-concepts/security> (19/09/2026).
- ⚠️ **Il caricamento pigro delle immagini non è coperto da queste fonti**: se ti serve, **cerca a
  parte** e cita.
- **Per ogni passo non coperto**, cerca prima di scrivere e **cita fonte + data nel commento**.

## Cosa dichiara finito il tuo lavoro

1. La pagina **col disegno del mockup** — toolbar, hero col nome umano, striscia a quattro blocchi,
   tre lati col contenuto vero — **vista sul 4174** nei due temi a 1024 e 1440, **foto tue a pagina
   intera e guardate**.
2. Le **foto affiancate** al mockup (stessa pagina, stessa larghezza, stesso tema) + la tabella delle
   differenze che restano.
3. I **due difetti** curati, ognuno **col rosso provato**: il `[object Object]` (`:994`) e ciò che
   decidi di fare delle immagini remote **dopo** la risposta dell'owner (fino ad allora: misurate e
   dichiarate, non cambiate).
4. Il tuo spec verde, e i cancelli degli altri verdi.
5. Per ogni difesa, **il rosso provato** (baseline verde, una rottura sola, ripristino al byte).
6. **Cosa nel mockup non si collega a dati veri**: elenco, con la ragione.

## Regole di casa

⛔ Niente `npm run build`/`public/`/commit · **4174 sola lettura** (non-GET fermate e contate) ·
**porta tua, 4219** · i selettori **dal sorgente, mai inventati** · ciò che non si collega **si elenca**.
