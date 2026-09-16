# Ledger Fase 4 — J: delega con evidenza verificabile

Data: 2026-08-30  
Perimetro: Harness desktop (`AVM-harness-desktop`), server locale `127.0.0.1:4174`. Mobile e TALOS-BANCO sono sola lettura/riferimento.

## Problema riprodotto

La sessione padre `82c71bd0-74d6-423f-b600-1dbe3bc5fdf7` ha creato le figlie:

- `2f22639c-30db-4b1c-9dd2-c0302cc93e00`;
- `b7e94ecd-194e-4929-91b4-3f74c349079d`;
- `cf5c1532-154f-4b4e-b036-81144a466940`.

Il loro `RunFinished.outcome.type` è `success`, ma i log mostrano `error: ENOENT`, `exit 1`, `no file matches` o cartelle WSL invalide. Due figlie hanno anche risposte tool non-fallite (salvataggio di una nota), ma nessuna contiene `StateDelta` con `/file/` o `ArtifactCreated`; il file reale
`C:\Users\Antonino\Desktop\projects\qa-visiva-harness-2026-08-30\serpente-2d\test\gioco.test.mjs` non cambia dopo le tre deleghe. Il server riavviato perde inoltre `esitoDelega`, perché il ripristino inizializza sempre quel campo a `null`.

## Decisione tecnica

`esitoDelegaDaRisultato(risultato, eventi, {task})` resta il solo normalizzatore del verdetto. Quando il task chiede una modifica, `ok:true` non basta senza evidenza strutturata di scrittura (`StateDelta /file/`) o artefatto (`ArtifactCreated`), anche se un tool secondario (per esempio un salvataggio di nota) è riuscito: il risultato diventa `fallito` con motivo esplicito. Per deleghe puramente informative/di ricerca una tool-call riuscita resta evidenza operativa sufficiente; una delega senza tool conserva il contratto. Nessun testo finale del modello viene trattato come prova di modifica su disco.

Il verdetto e il riepilogo dell'evidenza vengono applicati alla voce figlia dal callback di `delegaSottoTask`. Al ripristino, il verdetto viene ricalcolato dagli eventi persistiti: una figlia non può tornare a essere `concluso` solo perché il modello aveva terminato con testo ottimistico. La risposta `GET /children` espone `evidenzaDelega` per audit del foglio Albero sessione.

## File e simboli

### Da modificare

1. `harness-ui/src/subagent-orchestrator.mjs`
   - `analizzaEvidenzaDelega(eventi)` e `taskRichiedeEvidenzaScrittura(task)` (nuove funzioni pure);
   - `esitoDelegaDaRisultato(risultato, eventi, {task})` (guardia anti-falso-successo);
   - `esitoDelegaDaEventi(eventi, {task})` (ricostruzione dopo restart);
   - `creaSubagentOrchestrator().elencaFigli()` (campo `evidenzaDelega`);
   - `creaSubagentOrchestrator().delegaSottoTask()` (associazione sicura del `sessionId` figlio anche se il callback arriva subito).
2. `harness-ui/src/session-registry.mjs`
   - import dei normalizzatori J;
   - voce nuova con `evidenzaDelega` inizializzata a `null`;
   - `ripristina()` calcola `esitoDelega`/`evidenzaDelega` dagli eventi persistiti.
3. `harness-ui/tests/subagent-orchestrator.test.mjs`
   - RED: `ok:true` + tool error + nessuna evidenza ⇒ `fallito`;
   - GREEN: `ok:true` + `StateDelta /file/` ⇒ `concluso`;
   - RED/GREEN: una tool-call riuscita ma senza file/artefatto, su task di modifica, ⇒ `fallito`;
   - GREEN: callback sincrono e figlio in `Map` ricevono l'evidenza;
   - GREEN: ricostruzione da `RunFinished`/`RunError`.
4. `harness-ui/tests/session-registry.test.mjs`
   - persistenza/restore del verdetto J e del campo evidenza.
5. `harness-ui/scripts/qa-visual-pipeline.mjs`
   - scenario read-only `qa-delegation-artifact-integrity`: apre il padre, legge `/children`, cattura Albero sessione, confronta gli eventi e il file target sul disco senza avviare LLM né scrivere.
6. `.claude/QA-VISIVA-HARNESS-2026-08-30.md`
   - append-only: RED/GREEN, report, screenshot ispezionati, taccuino e confronto competitivo.
7. `mobile/public/harness-ui/app.js`
   - `rigaFiglio(figlio)` usa il badge errore `!` per una delega `fallito`, mai il check verde riservato a `concluso`.

### Simboli compatibili da mantenere

- `creaSubagentOrchestrator({ sessioni, avviaESeguiFn })`;
- `delegaSottoTask({ sessionPadreId, task, cartella })`;
- `elencaFigli(sessionPadreId)`;
- contratto kernel `onDelega(task, cartella) → Promise<{riassunto?, esito, motivo?}>`;
- eventi AG-UI esistenti (`StateDelta`, `ArtifactCreated`, `ToolCallResult`, `RunFinished`, `RunError`).

## Verifica RED

Comando mirato prima del fix:

```text
node --test tests/subagent-orchestrator.test.mjs tests/session-registry.test.mjs
```

Il nuovo test deve fallire perché l'implementazione corrente accetta `ok:true` guardando solo `esito.comeFinita` e non gli eventi operativi.

## Ricerca upstream (blocco soddisfatto prima del codice)

- Hermes documenta contesto isolato, summary finale strutturato con file modificati/problemi e distinzione `unknown` quando un riavvio non permette di provare gli effetti: <https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation>.
- OpenAI Codex documenta che il genitore riceve il riepilogo del figlio e può ispezionarne il thread, ma non usa il testo finale come prova automatica di artefatto: <https://developers.openai.com/codex/subagents>.
- pi-mono usa processi isolati e JSON per raccogliere il risultato, lasciando al coordinatore la validazione del payload: <https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/extensions/subagent/index.ts>.

Decisione AVM: adottare la separazione/summary di Hermes e la raccolta strutturata di Codex/pi, aggiungendo un controllo locale sugli eventi già emessi dal kernel. Non si introduce un parser di testo del modello, un nuovo processo, un nuovo endpoint di esecuzione o un cambiamento in TALOS-BANCO.

## Verifica GREEN e gate

1. Test mirati sopra, poi `node --test tests/*.test.mjs` dalla cartella `harness-ui`.
2. Suite dalla root desktop, registrando l'eventuale difetto di path F0 già noto.
3. `git diff --check`.
4. Scenario QA su desktop/laptop contro il server locale; ogni screenshot viene aperto e guardato interamente.
5. Nessuna verifica Pad in questa fase: ownership desktop dichiarata dall'owner; mobile resta riferimento read-only.

## Rollback

Ripristinare esclusivamente i file di codice/test elencati nella sezione “Da modificare”; non toccare report QA, session store o repository fratelli. Il rollback rimuove solo il controllo J e riporta il precedente contratto, senza alterare i dati delle sessioni.
