# Ledger Fase 3/H — limite giri e follow-up esplicito

Data: 2026-08-30  
Worktree: `C:\Users\Antonino\Desktop\projects\AVM-harness-desktop`  
Branch: `lane/harness-desktop`  
Ownership: desktop. `mobile/src/**` e l'app mobile restano sola lettura. Il server desktop serve per contratto `mobile/public/harness-ui/**` (`harness-ui/src/config.mjs` e relativo test): in questa fase quel bundle statico è la superficie desktop, non si modifica alcun componente Vue/mobile.

## Problema misurato

Scenario: una sessione raggiunge `RunError.code === "giri-esauriti"`. Il composer resta attivo e un messaggio successivo chiama correttamente `POST /resume`, quindi continua la stessa sessione e lo stesso task. L'interfaccia però mostra soltanto l'errore tecnico: non spiega questa conseguenza né indica «Nuova» come via per un task indipendente.

Prova locale, senza costo o mutazioni:

```text
node harness-ui/scripts/qa-visual-pipeline.mjs qa-turn-limit-followup --url=http://127.0.0.1:4174/ --porta=9568
```

Output:

```text
harness-ui/.qa-runs/qa-turn-limit-followup-2026-08-30T16-24-05-252Z/
```

- il replay GET/SSE usa la sessione persistita `514893db-a60f-4368-b548-2868e0678b06`;
- il POST `/resume` e il nuovo `EventSource` sono sostituiti soltanto nell'ultimo miglio del browser;
- `resume === 1` e il follow-up compare a schermo;
- nessuna eccezione JavaScript; unico HTTP 404: favicon preesistente;
- finding annotato: nessuna frase spiega «stesso task/stessa sessione» o «Nuova sessione».

Screenshot ispezionati per intero:

- `01-giri-esauriti-prima-follow-up.png`
- `02-giri-esauriti-follow-up.png`

Il layout desktop resta stabile: sidebar, topbar, conversation rail, context rail e composer non cambiano misura. Il problema è semantico e localizzato nella nota terminale.

## Ricerca primaria e confronto competitivo

Pin documentale: pagine ufficiali consultate il 2026-08-30; nessuna dipendenza software da aggiungere.

### Hermes Agent — riferimento principale

- `https://hermes-agent.nousresearch.com/docs/user-guide/configuration/`: il limite per turno è disabilitato di default perché i cap silenziosi troncavano i task; se configurato e raggiunto, Hermes concede una chiamata di chiusura e produce un riepilogo.
- `https://hermes-agent.nousresearch.com/docs/user-guide/features/goals`: quando un goal esaurisce il budget, Hermes mostra esattamente cosa è successo e le due azioni: `/goal resume` per continuare o `/goal clear` per fermare.
- `https://hermes-agent.nousresearch.com/docs/user-guide/sessions`: il resume è esplicito e mostra un riepilogo della conversazione prima del prompt.

Forza Hermes: conseguenza e azione successiva sono dichiarate. Debolezza per TALOS: copiare comandi slash nella UI grafica introdurrebbe una grammatica parallela inutile.

### pi

- `https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/compaction.md`: conserva continuità e contesto tramite compaction strutturata; è un riferimento per non perdere il lavoro, non definisce una UI grafica per il cap di iterazioni.

Forza pi: continuità del contesto. Gap rispetto a questo caso: nessun pattern desktop direttamente adottabile per spiegare il follow-up dopo un tetto applicativo.

### Codex

- `https://github.com/openai/codex/issues/21073`: il comportamento attuale sui limiti esterni lascia la sessione in attesa; l'auto-resume è una richiesta aperta, non un contratto da copiare.

Forza: il limite è strutturato e la sessione resta recuperabile. Debolezza: l'automatismo discusso non risolve la chiarezza della scelta utente.

### Claude Code, Gemini CLI, DeepSeek Harness, ChatGPT, OpenClaw/local runner

Nessuna fonte primaria trovata in questa ricerca che definisca meglio di Hermes la micro-UX «budget interno esaurito → continua lo stesso task oppure creane uno nuovo». Per questa singola decisione sono `N/A`, non usati come giustificazione.

## Decisione upstream

Adattare, non integrare: adottare il principio Hermes «stato + conseguenza + prossime azioni», espresso nella grammatica TALOS già esistente. Nessuna libreria, nuovo dialog, comando slash o cambiamento di backend.

Testo obiettivo:

```text
Il prossimo messaggio continuerà questo task nella stessa sessione. Premi «Nuova» per iniziare un task separato.
```

## Ledger a livello di codice

### File modificati

1. `harness-ui/scripts/qa-visual-pipeline.mjs`
   - scenario pubblico QA: `SCENARI['qa-turn-limit-followup']`;
   - prova browser desktop del replay reale, follow-up, assenza/presenza della spiegazione;
   - nessuna chiamata LLM e nessuna scrittura nel registro sessioni.

2. `mobile/public/harness-ui/app.js`
   - funzione esistente: `handleRealEvent(evento, generation)`;
   - solo ramo esistente `case 'RunError'`;
   - se `evento.code === 'giri-esauriti'`, aggiungere la frase obiettivo alla stessa `appendStatusNote`;
   - tutti gli altri `RunError` devono restare byte-per-byte semanticamente invariati.

3. `.claude/QA-VISIVA-HARNESS-2026-08-30.md`
   - append-only: RED, GREEN, screenshot completi, confronto competitor, limiti della prova.

### File creati

- `.claude/LEDGER-FASE-3-H-TURN-LIMIT-FOLLOWUP-2026-08-30.md`.

### File eliminati

- nessuno.

### Simboli pubblici/contratti

- nessun nuovo endpoint, schema, classe, metodo o funzione pubblica;
- `RunError.code` resta invariato;
- `POST /api/v1/sessions/:id/resume` resta invariato;
- il comportamento del composer resta invariato: follow-up sulla stessa sessione.

## TDD e verifiche

RED:

- scenario `qa-turn-limit-followup` annota il finding perché il replay non contiene una guida;
- screenshot prima/dopo follow-up e `resume === 1` provano il caso e il contrario.

Esito RED misurato: `harness-ui/.qa-runs/qa-turn-limit-followup-2026-08-30T16-24-05-252Z/`, due screenshot completi, finding H presente.

GREEN mirato:

```text
node harness-ui/scripts/qa-visual-pipeline.mjs qa-turn-limit-followup --url=http://127.0.0.1:4174/ --porta=9569
```

Atteso:

- la nota `giri-esauriti` spiega continuità e «Nuova»;
- una sola richiesta resume controllata;
- follow-up visibile;
- zero finding H, zero eccezioni JavaScript.

Esito GREEN desktop iniziale: `harness-ui/.qa-runs/qa-turn-limit-followup-2026-08-30T16-59-58-681Z/` — 1440×900, 2 screenshot ispezionati per intero, `resume === 1`, follow-up visibile, zero finding H, zero eccezioni; unico 404 è il favicon preesistente.

Esito GREEN laptop iniziale: `harness-ui/.qa-runs/qa-turn-limit-followup-2026-08-30T17-00-01-847Z/` — 1024×800, 2 screenshot ispezionati per intero, stessi esiti.

Controprova finale aggiornata (include il verso contrario per i codici diversi):

- desktop `harness-ui/.qa-runs/qa-turn-limit-followup-2026-08-30T17-02-07-516Z/` — 1440×900, 3 screenshot ispezionati per intero;
- laptop `harness-ui/.qa-runs/qa-turn-limit-followup-2026-08-30T17-02-10-991Z/` — 1024×800, 3 screenshot ispezionati per intero;
- in entrambe: `resume === 1`, follow-up visibile, `RunError` generico privo della guida speciale, zero finding H/eccezioni; unico 404 è il favicon preesistente.

Nessuna verifica Pad/mobile: fuori ownership.

Confronto visivo: su entrambe le viewport la frase resta nella stessa bolla errore senza spostare composer, sidebar o context rail; contrasto e wrapping sono leggibili. Hermes mantiene un recap/azione esplicita, quindi la frase è l'adattamento minimo coerente con TALOS; pi e Codex non offrono una micro-UX grafica più adatta da copiare.

Regressione:

```text
cd harness-ui
node --test tests/*.test.mjs
```

Esito: **960 pass, 0 fail**.

La stessa suite lanciata dalla radice con `node --test harness-ui/tests/*.test.mjs`
resta a **959 pass / 1 fail** per il difetto preesistente F0-TEST-PATH
(`harness-receipt-keypair.test.mjs` cerca `src/harness-receipt-keypair.mjs`
rispetto alla cwd radice); H non lo modifica.

Verifica statica finale:

```text
git diff --check
```

Prova umana desktop: server locale, Chrome, screenshot completi desktop e laptop. Pad/mobile: `N/A` per ownership esplicita dell'owner.

## Rollback

Rimuovere soltanto il suffisso condizionale dal ramo `RunError` e lo scenario QA dedicato. Nessun dato o contratto backend da migrare.
