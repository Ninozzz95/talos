# LEDGER — richieste del desktop al KERNEL (03/09/2026)

> Il kernel dell'agente è `AVM-harness/mobile/scripts/harness-talos/talosHarness.mjs`
> (repo separato, lane mobile). **Non è ownership della lane desktop**: qui si
> registra cosa serve, perché non può stare nell'adapter, e lo stato. Decide
> l'owner riga per riga; chi implementa lo fa nella lane mobile con il banco
> (`talosHarness.test.mjs`, 354 KB) verde. Finché una riga è `PENDING`, il
> desktop implementa la sola parte adapter descritta nella sua riga W2.

| ID | Riga desktop | Cosa serve dal kernel | Perché non nell'adapter | Punto d'innesto (kernel) | Stato |
|---|---|---|---|---|---|
| K-01 | W2-01 | Emettere il piano del pre-loop (Fase K, `GIRI_MASSIMI_PLANNER = 8`) come struttura `{ passi:[{ id, obiettivo, criterio }] }` via un nuovo callback `onPiano`, e accettare `awaiting_plan_approval` (attesa dell'ok prima del loop editor) | Il piano nasce dentro `talosLavora`; l'adapter oggi vede solo testo | `talosLavora({ … modelloPlanner })`, blocco `_giriMassimiInterno: GIRI_MASSIMI_PLANNER` | PENDING |
| K-02 | W2-03a/b/c, W2-05 | Un parametro `esecutore` iniettabile al posto di `eseguiComandoSandboxato` per `shell` e `prova` (firma `{ comando, cartella, timeoutMs, onOutput }` → `{ codice, testo, enforcement }`) | Oggi la scelta host/WSL2/adb è cablata nel kernel: nessun backend desktop può intercettarla | `eseguiComandoSandboxato(comando, cartella, { mobile })` e i suoi due chiamanti (`shell`, `prova`) | PENDING |
| K-03 | W2-05 | Livello di sandbox richiesto per attrezzo, esposto accanto a `SICUREZZA_PER_ATTREZZO`, e rifiuto fail-closed se l'`esecutore` non lo garantisce | La decisione «questo attrezzo richiede almeno il livello 2» è semantica del kernel | `SICUREZZA_PER_ATTREZZO`, `rischioEffettivo` | PENDING |
| K-04 | W2-06 | `compattaConversazione` restituisce anche una ricevuta `{ tenuti, sintetizzati, esclusi, tokenPrima, tokenDopo }` | La compattazione avviene nel kernel; l'adapter la chiama ma non sa cosa è stato perso | `compattaConversazione(messaggi, chiamaModello)` | PENDING |
| K-05 | W2-07 | Esportare, per ogni attrezzo, `effetti`, `idempotente`, `parallelizzabile` accanto a `SICUREZZA_PER_ATTREZZO` | Sono proprietà dell'implementazione dell'attrezzo | `ATTREZZI`, `ATTREZZI_ESTESI`, `SICUREZZA_PER_ATTREZZO` | PENDING |
| K-06 | W2-12 | Motore di ricerca event-sourced condiviso (stati incluso `awaiting_plan_approval`, linee di indagine, verifica indipendente, citazioni) riusabile dal desktop | Oggi il desktop riusa `talosLavora` con un'istruzione testuale (debito dichiarato nel kernel alla riga «nessuna approvazione del piano PRIMA di partire») | commento «Semplificazioni dal contratto mobile, dichiarate» in `talosHarness.mjs` (~riga 1290) | PENDING |
| K-07 | W0-01 (scoperta) | Se la corsa reale di W0-01 mostra sessioni con eventi senza `intestazione` scritta dal kernel, servirà una scrittura dell'intestazione garantita prima del primo evento | Da confermare con i motivi reali | `registraRigaSyncFn` è già dell'adapter: probabile `NOT_APPLICABLE` | DA VERIFICARE |

Regole: una richiesta accettata diventa una riga nel ledger della lane mobile con il suo test nel banco; il desktop aggiorna qui lo stato (`APPROVED` → `DONE <commit>`) e sblocca la parte adapter corrispondente. Una richiesta rifiutata resta con motivo e la riga W2 si chiude nella forma «solo adapter».
