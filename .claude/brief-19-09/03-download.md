# BRIEF — CORSIA 3 · la scheda «Download» (FASE 4)

> Owner 19/09/2026: «via fase 4». Modello: **Opus 5, sforzo high**.
> Scomposizione: `.claude/FASE-4-SCOMPOSIZIONE-2026-09-19.md`. Ripresa: `.claude/RIPRESA-PARITA-MOCKUP-2026-09-18.md`.

## ⛔ COSA ESISTE GIÀ — misurato sul 4174 il 19/09/2026

- `components/download-coda.js` (198 righe) e `components/modelli-installati.js` (265), **importati**
  (`app.js:54` e `app.js:49`).
- Il pannello `downloads` è visibile e alto **226 px**. Dentro, misurati: i comandi
  **«Mostra solo attivi»** e **«Vedi modello»**, e i badge **«1 completato»** e **«Completato»**.
  ⇒ ⛔ **La coda NON è vuota adesso**: ha un elemento completato. Lo stato vuoto del mockup si
  ottiene **riproducendolo** (una coda vuota vera), non aspettando.
- Il registro del laboratorio mostra già i **3 contatori** della coda (`aggiornaConteggiScheda`).

## Il mockup (misurato il 18/09/2026 dal DOM vivo)

`TALOS-Calm-Lab-04.html`, scheda `downloads`: ⛔ **VUOTA** — 74 elementi, **1 stato vuoto `1122×330`**:
**«Nessun download in coda.»** + **«Esplora il catalogo»**, **0 righe**.
⇒ Per questa scheda il mockup **non disegna il pieno**: quando la coda ha elementi, il vocabolario è
il suo, il contenuto è **il nostro vero** (owner 18/09: «il corrispondente reale così com'è ma
applicando solo lo stile»).

## Il tuo compito

1. **Lo stato vuoto del mockup** (`1122×330`, la frase, il bottone «Esplora il catalogo») quando la
   coda è davvero vuota — e il bottone deve portare **dove dice** (il catalogo).
2. **La coda vera** nello stile del mockup (riga, progresso, azioni), **senza perdere** i comandi che
   esistono oggi («Mostra solo attivi», «Vedi modello», i contatori).
3. I **3 contatori** del registro coerenti con le righe che si vedono (se dicono «1 completato», una
   riga completata deve esserci: la contraddizione fra contatore e lista è il difetto da non lasciare).

## I tuoi file — e SOLO questi

- `harness-ui/frontend/src/components/download-coda.js`
- `harness-ui/frontend/src/components/modelli-installati.js`
- un nuovo `harness-ui/frontend/tests/browser/lab-download.spec.mjs`

⛔ **NON toccare**: `src/legacy/app.js`, `src/legacy/frammenti.html`, `lab-cornice-v3.js`,
`cornice-model-lab.js`, `src/styles/*` (una regola che ti serve **la chiedi**, motivata),
`public/*`, e **ogni altro spec** — `_fase3-banda.spec.mjs` (10 verdi), `lab-guscio.spec.mjs` (9),
`_fase2-niente-perso.spec.mjs` devono restare verdi.

## Ricerca web — fatta, e vale come metro (19/09/2026)

- ⛔ **La voce della coda resta montata anche quando è vuota**: un download interrotto che sparisce
  lascia l'utente senza via di recupero. Lo stato vuoto **spiega cosa fare**, non è un vuoto muto.
- **Percentuali solo se le sai calcolare**: se manca il totale, **niente barra piena e niente 0** —
  stato indeterminato o a passi. Uno `0%` quando il dato non c'è è una bugia.
- **Pausa/Riproduci è un interruttore per riga**, non due bottoni; e il comando di stop si vede
  **sempre**, non solo al passaggio del mouse. L'etichetta deve dire **cosa succede davvero**
  («Riprendi» solo se il trasporto lo consente).
- **Riprova = un lavoro nuovo**, con l'originale tenuto come storia: non si riusa la stessa riga.
- **«Pulisci» non tocca gli elementi attivi**.
- **Uno stato di errore onesto**: il testo dell'errore non deve sopravvivere a un ripristino riuscito.
- Fonti: <https://github.com/unslothai/unsloth/pull/9849> ·
  <https://github.com/invoke-ai/InvokeAI/pull/8910> ·
  <https://deepwiki.com/UNIkeEN/SJMCL/4.10-download-tasks-page> ·
  <https://appmaster.io/it/blog/tasks-in-background-progress-updates-ui-patterns> (lette 19/09/2026).
- **Per ogni passo non coperto da queste**, cerca prima di scrivere e **cita fonte + data nel commento**.

## Cosa dichiara finito il tuo lavoro

1. **Lo stato vuoto del mockup** visto sul **4174** — riprodotto con una coda davvero vuota — in
   **entrambi i temi** a 1024 e 1440 (foto tue), col bottone che porta al catalogo.
2. **La coda piena** (l'elemento completato che c'è adesso) nello stile del mockup, senza comandi persi.
3. Contatori e righe **coerenti** (prova: con N righe i contatori dicono N).
4. Il tuo spec nuovo **verde**, e `npm run test:unit` **1420/1420**.
5. Per ogni difesa aggiunta, **il rosso provato**.

## Regole di casa

⛔ Niente `npm run build` né `public/*` · **il 4174 è sola lettura** (ogni non-GET fermata), per
provare usa uno store isolato e **una porta tua** (es. 4196) · niente commit né push · **i selettori
si leggono dal sorgente, mai inventati** · ci sono **duplicati legacy nascosti** nel DOM: ancora i
selettori a `#modelLabCard` + `[data-model-lab-panel="downloads"]` · **ciò che non si collega si
elenca, non si inventa**.
