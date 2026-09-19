# BRIEF — CORSIA 2 · la scheda «Provider» (FASE 4)

> Owner 19/09/2026: «via fase 4». Modello: **Opus 5, sforzo high**.
> Scomposizione: `.claude/FASE-4-SCOMPOSIZIONE-2026-09-19.md`. Ripresa: `.claude/RIPRESA-PARITA-MOCKUP-2026-09-18.md`.

## ⛔ COSA ESISTE GIÀ — misurato sul 4174 il 19/09/2026

- `components/provider-card.js` (284 righe), **importato** (`app.js:14`: `aggiornaProviderList`, `montaProviderPanel`).
- Il pannello `providers` è **visibile e alto 1791 px**; dentro ci sono i **28 fornitori veri** come
  card, ognuna con il suo stato della chiave — misurati: **«Chiave salvata»** (OpenRouter) ·
  **«Chiave dall'ambiente»** (OpenAI, DeepSeek, Anthropic, Google Gemini) · **«Chiave mancante»**
  (Kimi, MiniMax, Qwen, Z.AI, Groq) · **«Chiave facoltativa»** (Ollama Local, LM Studio) — più
  «Indirizzo predefinito» e «Mai provato».
- Comandi di testata misurati: **«Aggiorna»** e **«Prova tutti»**.
- Il velo delle chiavi è stato curato il 18/09 (`6e063619`: quattro difetti, menu «⋯» dentro il velo,
  z-index, listener) e ha la sua prova **verde**: `tests/browser/velo-fornitori.spec.mjs` (3 test).
- Il difetto **D9** è dichiarato e **non verificato**: «doppia testata» in `lab-provider`/`lab-download`
  («Collegamenti, non scatole nere.» + «Fornitori e accessi»). Nessuno lo sta guardando da quando la
  corsia C si è chiusa. **La sua è questa scheda: risolvilo o smentiscilo, con la misura.**

## Il mockup (misurato il 18/09/2026 dal DOM vivo)

`TALOS-Calm-Lab-04.html`, `#/impostazioni/modelli/providers`: **2 card `551×332`** — OpenRouter con
badge «Verificato · demo» + **«Configura»** + **«Verifica accesso»**; llama.cpp con «Locale · demo» +
**«Apri sistema»** — e l'avviso **«Qui non inserire chiavi reali.»**
⛔ L'app ne ha **28**, e il suo «Configura» apre le **modali vere**: il disegno del mockup va portato
sul contenuto vero **senza perdere una funzione** (owner: «non dobbiamo nascondere o perdere nessuna
funzione attuale della app»).

## Il tuo compito

Applicare il **vestito del mockup** alle 28 card reali (misure: `551×332`, raggio, padding, badge,
la riga di stato, il footer con le azioni), **mantenendo vive** le modali vere e il velo, risolvendo
**D9**, e lasciando verdi `velo-fornitori.spec.mjs` e le prove del velo.

## I tuoi file — e SOLO questi

- `harness-ui/frontend/src/components/provider-card.js`
- `harness-ui/frontend/tests/browser/velo-fornitori.spec.mjs` (solo se una sua asserzione va riletta — e allora **rileggila**, non adattarla)
- un nuovo `harness-ui/frontend/tests/browser/lab-provider.spec.mjs`

⛔ **NON toccare**: `src/legacy/app.js`, `src/legacy/frammenti.html`, `lab-cornice-v3.js`,
`cornice-model-lab.js`, `src/styles/*` (una regola CSS che ti serve **la chiedi**, motivata dalla
misura), `public/*`, e **ogni altro spec** — in particolare `_fase3-banda.spec.mjs` (10 verdi),
`lab-guscio.spec.mjs` (9 verdi), `_fase2-niente-perso.spec.mjs`: devono restare verdi.

## Ricerca web — fatta, e vale come metro (19/09/2026)

- Una card di fornitore **si legge come uno STATO, non come una barra di strumenti**: icona, nome,
  riga di stato con un punto, descrizione, e in fondo **una** azione; le azioni secondarie
  (modifica/elimina) vanno in testata, non in fila.
- **Il nome umano è primario, l'id grezzo secondario.**
- **La chiave non si mostra mai**: dopo la creazione solo un accenno mascherato; il segreto non entra
  nello stato della tabella né nei log.
- **Verifica prima di salvare** e stato verificabile **nel tempo** («Mai provato» non è «verificato»):
  è ciò che il nostro «Prova tutti» già fa — non perderlo.
- Un controllo disabilitato **senza spiegazione** fa sembrare rotto ciò che è solo non configurato.
- Fonti: <https://github.com/activepieces/activepieces/pull/14825> ·
  <https://github.com/coleam00/Archon/issues/1956> ·
  <https://deepwiki.com/tingly-dev/tingly-box/5.3-provider-configuration-pages> ·
  <https://enterprise-docs.dify.ai/en/3.12.x/use/workspace/model-providers> (lette 19/09/2026).
- **Per ogni passo non coperto da queste**, cerca prima di scrivere e **cita fonte + data nel commento**.

## Cosa dichiara finito il tuo lavoro

1. Le 28 card **nello stile del mockup**, viste sul **4174** in **entrambi i temi** a 1024 e 1440 (foto tue).
2. «Configura»/«Verifica accesso» aprono ancora le **modali vere** (prova che morde: se stacchi il
   legame, la prova diventa rossa).
3. **D9 risolto o smentito**, col numero che lo dice.
4. `velo-fornitori.spec.mjs` **verde** e il tuo spec nuovo verde; `npm run test:unit` **1420/1420**.
5. Per ogni difesa aggiunta, **il rosso provato**.

## Regole di casa

⛔ Niente `npm run build` né `public/` (il bundle lo fa l'orchestratore) · **il 4174 è sola lettura**
(ogni non-GET fermata) e per provare usi uno store isolato e **una porta tua** (es. 4195) ·
niente commit né push · **i selettori si leggono dal sorgente, mai inventati** · ci sono **duplicati
legacy nascosti** nel DOM: ancora i selettori a `#modelLabCard` + `[data-model-lab-panel="providers"]` ·
**ciò che non si collega si elenca, non si inventa**.
