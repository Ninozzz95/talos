# Ledger a livello di codice — ripresa sessione dopo RunError

Data: 2026-09-01  
Stato iniziale: **RED riprodotto su `4174`**.

## File esatti

### Modificare

- `harness-ui/src/session-registry.mjs`
- `harness-ui/src/http-app.mjs`
- `harness-ui/tests/session-registry.test.mjs`
- `harness-ui/tests/http-routes-sessions.test.mjs`
- `.claude/QA-VISIVA-HARNESS-2026-08-30.md`
- `.claude/PIANO-COMPLETO-DESKTOP-2026-08-31.md`

### Creare

- `.claude/DOSSIER-RICERCA-SESSION-RECOVERY-2026-09-01.md`
- `.claude/LEDGER-SESSION-RECOVERY-2026-09-01.md`
- `.claude/CONSEGNA-SESSION-RECOVERY-2026-09-01.md`

### Eliminare

- Nessuno.

## Simboli

- `messaggiRipristinabiliDaEventi(voce)` — parser tipizzato di RunStarted e
  TextMessage completo; nessuna regex sul JSONL.
- `persistiMessaggiFinali(voce, versioneGiro)` — snapshot sincrono correlato
  alla generazione esatta del giro; una write tardiva non può prevalere sul
  checkpoint di un giro successivo.
- `persistiCheckpointRipresa(voce, messaggi, versioneGiro)` — salva in modo
  sincrono il nuovo input prima del runtime, separato dall’output finale.
- `requireResumeBody(body)` — accetta esclusivamente un plain object vuoto o
  `{messaggio:stringaNonVuota}`; array, `null` e primitivi falliscono chiusi.
- `resume(sessionId, nuovoMessaggioUtente)` — conserva il comportamento
  corrente per storia canonica; ricostruisce se la sessione è conclusa oppure
  se è stata ripristinata come `interrotta:true`, esclusivamente quando riceve
  un nuovo messaggio.
- Compatibilità stabile: `resume()` senza nuovo messaggio e una sessione
  realmente viva nello stesso processo restano `SESSION_NOT_READY`.

## RED permanenti

1. `SESSION-RECOVERY-RUNERROR-01` — primo giro emette RunStarted + RunError
   senza `messaggiFinali`; follow-up riparte sullo stesso ID e passa al runtime
   `[prompt originale, nuovo follow-up]`.
2. `SESSION-RECOVERY-RESTART-02` — la stessa storia ripristinata dal JSONL
   dopo riavvio accetta il follow-up e mantiene workspace/modello/permessi.
3. `SESSION-RECOVERY-PARTIAL-03` — testo assistant senza TextMessageEnd non
   entra nel nuovo contesto.
4. `SESSION-RECOVERY-COMPLETE-04` — testo assistant completo entra una volta,
   in ordine, senza reasoning/tool output.
5. `SESSION-RECOVERY-INTERRUPTED-05` — una sessione rimasta a metà e
   ripristinata dopo un riavvio accetta un nuovo turno sullo stesso ID,
   ricostruendo soltanto messaggi provati dagli eventi.
6. `SESSION-RECOVERY-HTTP-06` — POST resume su sessione conclusa RunError non
   restituisce più 409; torna lo stesso session ID.
7. `SESSION-RECOVERY-LIVE-INVERSE-07` — una sessione ancora viva nello stesso
   processo non può essere duplicata da un secondo `resume` concorrente.
8. `SESSION-RECOVERY-INTERRUPTED-HTTP-08` — POST resume su una sessione
   ripristinata `interrotta:true` accetta il follow-up e torna lo stesso ID.
9. `SESSION-RECOVERY-TRAILING-WORKSPACE-09` — un `WorkspaceChanged` successivo
   a `RunError` non riapre la sessione: lo stato terminale deriva dall'ultimo
   evento del ciclo agente.
10. `SESSION-RECOVERY-STALE-HISTORY-10` — una vecchia riga
    `messaggi-finali` precedente a un nuovo `RunStarted` incompleto non
    traveste il nuovo giro come concluso.
11. `SESSION-RECOVERY-DURABLE-BEFORE-RUNTIME-11` — il checkpoint del nuovo
    input è già leggibile dal JSONL quando il runtime viene invocato.
12. `SESSION-RECOVERY-FOLLOWUP-FAILURE-12` — storia riuscita, follow-up,
    RunError e nuovo retry non perdono il follow-up accettato.
13. `SESSION-RECOVERY-CHECKPOINT-CRASH-13` — un crash fra checkpoint e
    terminale resta `interrotta:true`, mai falsamente concluso; un nuovo
    messaggio riparte dal checkpoint.
14. `SESSION-RECOVERY-CONCURRENT-14` — dopo il primo resume un secondo resume
    immediato sullo stesso ID torna `SESSION_NOT_READY` e non crea un giro
    concorrente.
15. `SESSION-RECOVERY-REACTIVATE-15` — appena il giro riparte,
    `interrotta:false` e le operazioni da sessione viva vedono lo stato vero.
16. `SESSION-RECOVERY-HTTP-BODY-16` — il body è soltanto vuoto oppure
    esattamente `{messaggio:stringaNonVuota}`; tipo errato e chiavi extra sono
    `400 QUERY_INVALID`.
17. `SESSION-RECOVERY-DURABLE-FAILURE-17` — se il checkpoint non può essere
    scritto, il runtime non parte e la sessione precedente resta conclusa.
18. `SESSION-RECOVERY-LATE-FINAL-18` — uno snapshot del giro precedente
    assestato fisicamente dopo il nuovo `RunStarted` non chiude il giro nuovo
    e non sostituisce il suo checkpoint.
19. `SESSION-RECOVERY-REJECTION-19` — una Promise runtime rigettata conserva
    il follow-up nel retry dello stesso processo, non soltanto dopo restart.
20. `SESSION-RECOVERY-STORE-HTTP-20` — l’errore di checkpoint resta
    `503 SESSION_STORE_WRITE_FAILED` al boundary HTTP, mai `INTERNAL_ERROR`.
21. `SESSION-RECOVERY-VERSIONED-FINAL-21` — uno snapshot finale correlato al
    giro corrente conferma la conclusione anche se l’append asincrona
    dell’evento terminale non è arrivata sul disco.
22. `SESSION-RECOVERY-CHECKPOINT-BEFORE-START-22` — un checkpoint del giro 2
    scritto dopo il terminale/finale del giro 1 ma prima di `RunStarted` 2
    ripristina la sessione come interrotta e rifiuta un resume senza nuovo
    input.
23. `SESSION-RECOVERY-REDIRECT-CRASH-23` — un redirect con cronologia canonica
    salva il proprio checkpoint versionato prima del runtime; un crash nel
    giro reindirizzato non perde né il testo del redirect né la storia
    precedente.

## Gate

- focused: `node --test --test-name-pattern="SESSION-RECOVERY" harness-ui/tests/session-registry.test.mjs harness-ui/tests/http-routes-sessions.test.mjs`;
- affected: `node --test harness-ui/tests/session-registry.test.mjs harness-ui/tests/http-routes-sessions.test.mjs`;
- backend completo: tutti i `harness-ui/tests/*.test.mjs` con `node --test`;
- browser completo e frontend unit/contract perché il composer è il chiamante;
- Qwen reale esclusivamente `qwen/qwen3.8-flash` su server isolato;
- `4174` non viene interrotto durante implementazione e test;
- per applicare il nuovo codice al processo già in memoria sarà necessario un
  riavvio esplicito autorizzato dall'owner; dopo il riavvio: health 200,
  selezione della sessione fallita reale, invio di un messaggio Qwen e reload.

## Rollback

Rimuovere soltanto il parser/fallback e i test nominati. Non toccare lo store,
non cancellare sessioni e non riscrivere JSONL esistenti.
