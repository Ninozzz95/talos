# BRIEF — CORSIA A · la lista «Hugging Face» come la disegna il mockup

> FASE 4-bis, owner 19/09/2026: «**La lista Hugging Face non è quella del mock-up. Il mock-up ha una
> formattazione e uno stile molto migliore**». Metodo: **lo stesso delle Impostazioni, niente di meno**.
> Scomposizione: `.claude/FASE-4-BIS-CORREZIONI-2026-09-19.md`. Modello: **Opus 5, high**.

## ⛔ COSA ESISTE GIÀ (misurato il 19/09/2026)

- **Il mockup**, misurato dal suo DOM vivo (`C:/Users/Antonino/Downloads/TALOS-Calm-Lab-04.html`,
  servito su `127.0.0.1:4214`; foto in `%TEMP%/mockup-tre-schede/models-mockup.png`):
  - riga di comandi: **campo di ricerca** + «**Ordina**» + selettore «**Ordine del catalogo**»;
  - **chip coi conteggi**: *Tutti* (attivo) · *Locali **12*** · *Cloud **3*** · *Installati **2*** ·
    *☆ Preferiti*, ognuno con lo `span.facet-count`; a destra «**Tutti i filtri**»;
  - **4 select di faccetta**: *Grandezza - parametri totali* · *Contesto minimo - token* ·
    *Formato del file* · *Compatibilità RAM - demo*, con la nota «1B = un miliardo di parametri.
    Parametri ≠ peso del file ≠ memoria richiesta.»;
  - «**15 modelli su 15** nel catalogo demo» + «Viste salvate (0)» + «**+ Salva vista**»;
  - **gruppi**: «SUL DISPOSITIVO **12**» / «VIA PROVIDER **3**»;
  - **righe `1122×96`** (`.model-row`, con `.model-row-copy` `764×64` dentro): glyph 38×38, nome
    14/550 + badge «Predefinito», meta «Qwen · 5,2 GiB · Q4_K_M», «● Sul dispositivo»; a destra
    «8,2B / parametri totali», «32.768 token», chevron «›», stella preferiti, casella confronta.
- **Da noi** (`components/hf-catalogo.js`, 527 righe): la lista HF è un'altra cosa — riquadri-bottone
  con nome e due numeri, senza chip, senza faccette, senza gruppi.
- ⛔ **Le faccette ESISTONO già** (`components/catalogo-faccette.js`, 426 righe: gruppi, righe,
  caselle, chip, «Vedi altri», conteggi, `senzaDati`) e sono **collegate al catalogo dei fornitori**
  (scheda «Provider», dietro `#modelLabCatalogDoor`) — **non** alla lista Hugging Face.

## Il tuo compito

Portare nella **lista Hugging Face** la forma del mockup — chip coi conteggi, le quattro faccette,
i gruppi, le righe `1122×96` — **collegate ai dati VERI** della ricerca Hugging Face (i repository
che la scheda mostra oggi), e **non** al catalogo dei fornitori (che è un'altra superficie e resta
dov'è). Ciò che il mockup mostra e i nostri dati non hanno **si elenca, non si inventa**.

⛔ **Il clic sulla riga NON è tuo**: la destinazione (la scheda del modello nella **sidebar**) è
dell'orchestratore, che tocca `legacy/app.js`. Tu consegni la lista con la riga cliccabile e
**dichiari** nel resoconto quale nodo/evento l'orchestratore deve agganciare.

## I tuoi file — e SOLO questi

- `harness-ui/frontend/src/components/hf-catalogo.js`
- `harness-ui/frontend/src/components/catalogo-modelli.js` (solo per riusare la barra a faccette: il
  file è condiviso con la superficie dei fornitori — **se devi cambiarlo, cambia solo aggiunte**)
- un nuovo `harness-ui/frontend/tests/browser/lab-hf-lista.spec.mjs`

⛔ **NON toccare**: `src/legacy/app.js`, `index.template.html`, `src/components/lab-cornice-v3.js`,
`cornice-model-lab.js`, `provider-card.js`, `download-coda.js`, `misura-memoria.js`, `src/styles/*`
(una regola CSS che ti serve **la chiedi** all'orchestratore, motivata dalla misura), `public/*`.
⛔ **E non rompere i cancelli verdi**: `lab-faccette` 10, `lab-provider` 9, `lab-download` 9,
`lab-sistema` 9, `_fase3-banda` 10, `lab-guscio` 9, `_fase2-niente-perso` 1 — rilanciane almeno i
tre che toccano il catalogo prima di consegnare.

## Ricerca — fatta per questo passo (19/09/2026), e vale come metro

- **Il conteggio per valore** è ciò che distingue una faccetta da un muro di caselle; **OR dentro una
  faccetta e AND fra faccette**; **i valori a zero si GRIGIANO**, non si nascondono; «Vedi altri»
  oltre 5-10 valori; `aria-live` sui cambi di risultato; massimo 5-8 faccette visibili.
  Fonti: <https://www.saasui.design/blog/saas-filtering-sorting-ux-patterns> ·
  <https://www.ideaplan.io/templates/faceted-search-template> ·
  <https://www.designsystems.one/design-systems/patterns/filters-and-refinement> ·
  <https://www.uixhero.com/resources/ui-components/filter> (lette il 19/09/2026).
- **Per ogni passo NON coperto da queste**, cerca prima di scrivere e **cita fonte + data nel
  commento**. Se una ricerca non c'è, il passo non è giustificato.

## Cosa dichiara finito il tuo lavoro

1. La lista HF **col disegno del mockup** — ricerca, ordina, chip coi conteggi **veri**, le quattro
   faccette, i gruppi, le righe — **vista sul 4174** nei due temi a 1024 e 1440, **foto tue a pagina
   intera** e guardate.
2. Le **foto affiancate** al mockup (stessa scheda, stessa larghezza, stesso tema) con la tabella
   delle differenze che restano: è il confronto che l'owner pretende.
3. Il tuo spec nuovo verde, e i cancelli esistenti verdi.
4. Per **ogni difesa** aggiunta, il rosso provato: baseline verde, si rompe **una cosa sola**, la
   prova deve diventare **rossa**, ripristino verificato **al byte**. Se resta verde, scrivilo.
5. **Cosa nel mockup non si collega a dati veri**: elenco, con la ragione.

## Regole di casa

⛔ Niente `npm run build`, niente `public/`, niente commit né push · **il 4174 è sola lettura** (ogni
non-GET fermata e contata); per provare: store isolato e **porta tua, 4215** ·
⛔ **i selettori si leggono dal sorgente, mai inventati** (è costato due falsi allarmi oggi) ·
ci sono **duplicati legacy nascosti** nel DOM: ancora i selettori a `#modelLabCard` ·
**ciò che non si collega si elenca, non si inventa**.
