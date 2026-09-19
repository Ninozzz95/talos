# BRIEF — CORSIA 4 · la scheda «Sistema» (FASE 4)

> Owner 19/09/2026: «via fase 4». Modello: **Opus 5, sforzo high**.
> Scomposizione: `.claude/FASE-4-SCOMPOSIZIONE-2026-09-19.md`. Ripresa: `.claude/RIPRESA-PARITA-MOCKUP-2026-09-18.md`.

## ⛔ COSA ESISTE GIÀ — misurato sul 4174 il 19/09/2026

- `components/misura-memoria.js` (104 righe), **importato** (`app.js:21`: `aggiornaMisuraMemoria`,
  `montaMisuraMemoria`).
- La scheda «Sistema» mostra il pannello **`overview`** (la Panoramica), alto **1465 px**, con i
  comandi misurati: **«Rimisura»** · **«Libera memoria del modello»** · **«Motore»** · **«Modello»** ·
  **«Aggiorna runtime»** · **«Prova runtime»**.
- I **fatti veri** che quel pannello scrive (misurati adesso): `#machineMemoryMetric` **31,6 GiB** ·
  `#machineFreeMemoryMetric` **11,7 GiB** · `#machineStorageMetric` **213,3 GiB** ·
  `#machineAllocatableMetric` **212,3 GiB** · `#memoriaBarraEtichetta` **«19,9 GiB in uso su
  31,6 GiB · 63%»**.
- I badge misurati: **«Misurato 10:58:47»** · **«Nessun runtime raggiunto»** · **«Non raggiunto»**
  (×2) · **«Non avviato»**.
- ⛔ **DUE COSE DA NON ROMPERE, e sono la ragione per cui questa corsia è delicata:**
  1. **la banda della FASE 3 legge `#machineMemoryMetric` da questo pannello** — è il denominatore
     della sua barra. La prova `_fase3-banda.spec.mjs` (10 verdi) **deve restare verde**;
  2. il cancello **`_fase2-niente-perso.spec.mjs`** conta gli id di questa superficie: **nessun id
     si perde**.

## Il mockup (misurato il 18/09/2026 dal DOM vivo)

`TALOS-Calm-Lab-04.html`, scheda `system`: **2 card** — «**Memoria di esempio**» con badge
**«Fixture»** (18,6 GiB, GPU/VRAM «Non rilevate») e «**Runtime locale**» con badge «**Pronto · demo**»
(llama.cpp, «Simula nuova verifica»). ⇒ Il mockup lì mostra **dati finti dichiarati**: da noi ci sono
i **dati veri**, e il vestito è il suo.

## Il tuo compito

Portare sulle **due card** il vestito del mockup, **sul contenuto vero**, senza perdere un id e senza
rompere la banda. In particolare: il badge del mockup è una **dichiarazione sulla natura del dato**
(«Fixture» = finto, «Pronto · demo» = simulato) — da noi la stessa posizione deve dire la **verità
sul dato vero** (è **misurato**? è **vecchio**? il runtime è **raggiungibile**?).

## I tuoi file — e SOLO questi

- `harness-ui/frontend/src/components/misura-memoria.js`
- un nuovo `harness-ui/frontend/tests/browser/lab-sistema.spec.mjs`

⛔ **NON toccare**: `src/legacy/app.js`, `src/legacy/frammenti.html`, `lab-cornice-v3.js`,
`cornice-model-lab.js`, `src/styles/*` (una regola che ti serve **la chiedi**, motivata), `public/*`,
e **ogni altro spec** — `_fase3-banda.spec.mjs` (10), `lab-guscio.spec.mjs` (9),
`_fase2-niente-perso.spec.mjs` devono restare verdi. ⛔ **Non rimuovere né rinominare
`#machineMemoryMetric`**: è il numeratore… è il **denominatore** della barra della banda.

## Ricerca web — fatta, e vale come metro (19/09/2026)

- ⛔ **Un dato vecchio si mostra CON LA SUA ETÀ**, e la tenuta scade dopo ~60 s: mostrare **zero**
  quando la misura non c'è (o è stantia) è la bugia più comune di queste superfici. Il badge
  «Misurato 10:58:47» è già metà della strada: dagli la forma del mockup, non togliergli il tempo.
- **Degrado garbato**: quando lo strumento non è disponibile, la sezione si **spegne spiegando**
  («Nessun runtime raggiunto» è meglio di una card con zeri), invece di disegnare numeri finti.
- **Cadenza**: la telemetria si raccoglie a 1-2 s; ciò che si aggiorna da solo non deve costare su
  una scheda non visibile.
- **Local-first**: nessuna telefonata a casa, nessuna CDN. È già la regola del prodotto: non romperla.
- Fonti: <https://github.com/hasso5703/neurodash> ·
  <https://github.com/Forge-the-Kingdom/llm-serve-dashboard> ·
  <https://www.npmjs.com/package/@rosepetal/node-red-dashboard-2-system-monitor> ·
  <https://github.com/Theohox/zmenu> (letti il 19/09/2026).
- **Per ogni passo non coperto da queste**, cerca prima di scrivere e **cita fonte + data nel commento**.

## Cosa dichiara finito il tuo lavoro

1. Le due card del mockup sul contenuto **vero**, viste sul **4174** in **entrambi i temi** a 1024 e
   1440 (foto tue).
2. **`_fase3-banda.spec.mjs` 10/10** e **`_fase2-niente-perso` verde**: rilanciati da te, prima di
   consegnare.
3. Il tuo spec nuovo verde, `npm run test:unit` **1420/1420**.
4. Per ogni difesa aggiunta, **il rosso provato**.
5. ⭐ **Una domanda a cui rispondere con una misura, non con un'opinione**: adesso i badge dicono
   «Nessun runtime raggiunto» / «Non raggiunto» / «Non avviato», mentre il registro del laboratorio
   dice **«1 runtime disponibile»**. Le due frasi **si contraddicono**? Misura quale delle due è vera
   e riportalo: se è un'etichetta che legge il campo sbagliato, è un difetto vero (la memoria del
   14/09 ha già un aperto su «il lab modelli dice GPU e Hexagon assenti»).

## Regole di casa

⛔ Niente `npm run build` né `public/*` · **il 4174 è sola lettura** (ogni non-GET fermata), per
provare usa uno store isolato e **una porta tua** (es. 4197) · niente commit né push · **i selettori
si leggono dal sorgente, mai inventati** · **ciò che non si collega si elenca, non si inventa**.
