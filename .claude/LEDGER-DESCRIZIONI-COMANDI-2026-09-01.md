# Ledger esecutivo — descrizioni dei comandi espansi

Data: 2026-09-01  
Stato iniziale: RED da produrre prima del codice prodotto.  
Perimetro: TALOS UI desktop + adapter runtime desktop. Mobile: sola lettura.

## Contratti di compatibilità

1. Il batch aggregato continua a contare successi/errori: “N comandi eseguiti (M errori)”.
2. Ogni riga `shell` mantiene lo stesso nodo DOM da start, argomenti e risultato.
3. La descrizione del modello è la label primaria; comando ed esito restano nel dettaglio.
4. Senza descrizione, le sessioni storiche mantengono i fallback esistenti.
5. Nessuno schema MCP/plugin/Forge viene modificato.
6. Il processo owner `127.0.0.1:4174` non viene fermato o riavviato senza nuova autorizzazione esplicita.

## File esatti

### Creare

- `.claude/DOSSIER-RICERCA-DESCRIZIONI-COMANDI-2026-09-01.md`
- `.claude/LEDGER-DESCRIZIONI-COMANDI-2026-09-01.md`
- `.claude/CONSEGNA-DESCRIZIONI-COMANDI-2026-09-01.md`

### Modificare

- `harness-ui/src/runtime-owner-adapter.mjs`
- `harness-ui/tests/runtime-owner-adapter.test.mjs`
- `harness-ui/public/app.js`
- `harness-ui/frontend/tests/browser/baseline-shell.spec.mjs`
- `.claude/PIANO-COMPLETO-DESKTOP-2026-08-31.md`
- `.claude/QA-VISIVA-HARNESS-2026-08-30.md`
- `harness-ui/frontend/tests/fixtures/legacy-contract.snapshot.json`

### Eliminare

- Nessun file.

## Simboli pubblici e compatibilità

- Nuovo `export function adattaRichiestaConDescrizioneComando(body)` in `runtime-owner-adapter.mjs`: funzione pura, non muta l’input; arricchisce soltanto il tool `shell` OpenAI-compatible.
- Nuovo `export function creaFetchConDescrizioneComando(fetchDiRete)` nello stesso file: adapter di trasporto che preserva URL, header, signal e risposta.
- `createOwnerRuntimeAdapter().talosLavora(input)` resta con la stessa firma pubblica; inietta il wrapper rispettando un eventuale `input.fetchDiRete` già fornito.
- Nessuna modifica al contratto AG-UI (`ToolCallStart`, `ToolCallArgs`, `ToolCallResult`): `descrizione` viaggia dentro gli argomenti JSON già canonici.
- Funzioni UI private interessate: `riassuntoAttrezzoInCorso`, `riassuntoAttrezzo`, `riassuntoAttrezzoConcluso`, `renderizzaArgomentiAttrezzo`.

## RED

1. `harness-ui/tests/runtime-owner-adapter.test.mjs`
   - `TOOL-DESCRIPTION-CONTRACT-01`: la richiesta `shell` deve contenere proprietà e required `descrizione` senza mutare il body originale.
   - `TOOL-DESCRIPTION-THIRD-PARTY-02`: un tool non-shell deve restare byte-semantically invariato.
   - `TOOL-DESCRIPTION-FALLBACK-03`: body non JSON o senza tools passa invariato.
2. `harness-ui/frontend/tests/browser/baseline-shell.spec.mjs`
   - `TOOL-DESCRIPTION-LIFECYCLE-04`: “Verifica la configurazione del server” resta visibile nella stessa riga dopo il risultato; `descrizione` non è duplicata nei dettagli.
   - `TOOL-DESCRIPTION-LEGACY-05`: senza descrizione resta “1 comando eseguito/fallito”.

Fallimento atteso prima del GREEN: funzioni adapter mancanti e riga finale sostituita dal conteggio generico.

## GREEN mirato

1. `node --test harness-ui/tests/runtime-owner-adapter.test.mjs`
2. Da `harness-ui/frontend`: `npx playwright test tests/browser/baseline-shell.spec.mjs --grep "TOOL-DESCRIPTION"`
3. Screenshot dedicati a 1440×900 e 1024×800 con batch espanso.

## Regressione

1. `node --test harness-ui/tests/*.test.mjs` dalla radice repo.
2. Da `harness-ui/frontend`: `npm run verify` e `npm run test:browser`.
3. `git diff --check`.
4. Health del server owner 4174 prima e dopo: HTTP 200.

## Gate reale e prova visibile

- Avviare un server isolato su 4175 con il runtime owner configurato; inviare un solo messaggio al modello autorizzato Qwen 3.8 Flash e verificare che una chiamata shell emetta `descrizione`.
- Sul server owner 4174 la modifica backend non può essere caricata senza riavvio. Se il gate integrato richiede il riavvio, chiedere autorizzazione fresca; fino ad allora la consegna dichiara il limite senza fingere il verde.
- Aprire il batch, ispezionare screenshot interi e annotare overflow, gerarchia, stato errore, focus, riduzione movimento e fallback storico.

## Review indipendente

Dopo i gate principali, il reviewer può eseguire soltanto test mirati e revisione meccanica di diff/contratti. Ogni finding bloccante torna al main agent, che implementa e aggiorna questo ledger prima del commit.

## Rollback

Revert dei soli file prodotto sopra. Nessuna migrazione, nessun cambiamento ai dati sessione, nessun cambio al runtime mobile.

## Amendments osservati durante il GREEN

- `TOOL-DESCRIPTION-SNAPSHOT-06`: il gate `npm run verify` ha rilevato il cambio intenzionale di `app.js` (8958→8967 righe; 483291→483859 byte). È stato aggiornato esclusivamente il digest dell’asset `app` nella fixture congelata; host globals, storage keys, eventi, endpoint e altri asset sono rimasti invariati.
- `TOOL-DESCRIPTION-REAL-RUN-07`: sul server isolato 4175, Qwen 3.8 Flash ha emesso davvero `descrizione: "Sto verificando la versione di Node.js installata sul progetto"` insieme a `comando: "node --version"`; il comando ha restituito `exit 0` e `v24.18.0`. Il secondo giro testuale è rimasto in attesa ed è stato annullato sul solo server isolato: finding di robustezza separato, non nascosto e non attribuito alla label UI.
